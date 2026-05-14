import { Types } from 'mongoose';
import { GroupModel, DEFAULT_CONSTRAINTS, type GroupConstraints, type GroupDoc } from './group.model.js';
import { MembershipModel } from './membership.model.js';
import type { User } from '../users/user.model.js';
import { generateGroupCode, normalizeGroupCode } from '../../lib/slug.js';

export class ServiceError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

export interface GroupSummary {
  id: string;
  code: string;
  name: string;
}

export interface GroupMember {
  userId: string;
  name: string;
  email: string;
  picture: string | null;
  role: 'organizer' | 'member';
  joinedAt: Date;
}

export interface GroupDetail extends GroupSummary {
  organizerId: string;
  members: GroupMember[];
  constraints: GroupConstraints;
}

function toSummary(group: GroupDoc): GroupSummary {
  return {
    id: group._id.toString(),
    code: group.code,
    name: group.name,
  };
}

export async function createGroup(userIdStr: string, name: string): Promise<GroupSummary> {
  const userId = new Types.ObjectId(userIdStr);

  let group: GroupDoc | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateGroupCode();
    try {
      group = await GroupModel.create({ code, name, organizerId: userId });
      break;
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 11000) continue;
      throw e;
    }
  }
  if (!group) throw new ServiceError('could_not_generate_code', 500);

  await MembershipModel.create({ groupId: group._id, userId, role: 'organizer' });
  return toSummary(group);
}

export async function joinGroup(
  userIdStr: string,
  rawCode: string,
): Promise<GroupSummary & { alreadyMember?: boolean }> {
  const code = normalizeGroupCode(rawCode);
  const userId = new Types.ObjectId(userIdStr);

  const group = await GroupModel.findOne({ code });
  if (!group) throw new ServiceError('group_not_found', 404);

  const existing = await MembershipModel.findOne({ groupId: group._id, userId });
  if (existing) return { ...toSummary(group), alreadyMember: true };

  await MembershipModel.create({ groupId: group._id, userId, role: 'member' });
  return toSummary(group);
}

export async function getGroupDetail(
  userIdStr: string,
  groupIdStr: string,
): Promise<GroupDetail> {
  if (!Types.ObjectId.isValid(groupIdStr)) throw new ServiceError('invalid_id', 400);

  const groupId = new Types.ObjectId(groupIdStr);
  const userId = new Types.ObjectId(userIdStr);

  const membership = await MembershipModel.findOne({ groupId, userId });
  if (!membership) throw new ServiceError('not_a_member', 403);

  const group = await GroupModel.findById(groupId).lean();
  if (!group) throw new ServiceError('group_not_found', 404);

  const members = await MembershipModel.find({ groupId })
    .populate<{ userId: User }>({ path: 'userId', select: 'name email picture' })
    .lean();

  return {
    id: group._id.toString(),
    code: group.code,
    name: group.name,
    organizerId: group.organizerId.toString(),
    constraints: group.constraints ?? DEFAULT_CONSTRAINTS,
    members: members.map((m) => ({
      userId: m.userId._id.toString(),
      name: m.userId.name,
      email: m.userId.email,
      picture: m.userId.picture ?? null,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  };
}

export type ConstraintsPatch = {
  [K in keyof GroupConstraints]?: GroupConstraints[K] | undefined;
};

export async function deleteGroup(userIdStr: string, groupIdStr: string): Promise<void> {
  if (!Types.ObjectId.isValid(groupIdStr)) throw new ServiceError('invalid_id', 400);

  const groupId = new Types.ObjectId(groupIdStr);
  const userId = new Types.ObjectId(userIdStr);

  const group = await GroupModel.findById(groupId);
  if (!group) throw new ServiceError('group_not_found', 404);
  if (!group.organizerId.equals(userId)) throw new ServiceError('not_organizer', 403);

  await MembershipModel.deleteMany({ groupId });
  await GroupModel.deleteOne({ _id: groupId });
}

export async function rotateGroupCode(
  userIdStr: string,
  groupIdStr: string,
): Promise<GroupSummary> {
  if (!Types.ObjectId.isValid(groupIdStr)) throw new ServiceError('invalid_id', 400);

  const groupId = new Types.ObjectId(groupIdStr);
  const userId = new Types.ObjectId(userIdStr);

  const group = await GroupModel.findById(groupId);
  if (!group) throw new ServiceError('group_not_found', 404);
  if (!group.organizerId.equals(userId)) throw new ServiceError('not_organizer', 403);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const newCode = generateGroupCode();
    if (newCode === group.code) continue;
    try {
      group.set('code', newCode);
      await group.save();
      return toSummary(group);
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 11000) continue;
      throw e;
    }
  }
  throw new ServiceError('could_not_generate_code', 500);
}

export async function updateConstraints(
  userIdStr: string,
  groupIdStr: string,
  patch: ConstraintsPatch,
): Promise<GroupConstraints> {
  if (!Types.ObjectId.isValid(groupIdStr)) throw new ServiceError('invalid_id', 400);

  const groupId = new Types.ObjectId(groupIdStr);
  const userId = new Types.ObjectId(userIdStr);

  const group = await GroupModel.findById(groupId);
  if (!group) throw new ServiceError('group_not_found', 404);
  if (!group.organizerId.equals(userId)) throw new ServiceError('not_organizer', 403);

  const current = group.constraints ?? DEFAULT_CONSTRAINTS;
  const next: GroupConstraints = { ...current };
  if (patch.excludedWeekdays !== undefined) next.excludedWeekdays = patch.excludedWeekdays;
  if (patch.noEarlierThan !== undefined) next.noEarlierThan = patch.noEarlierThan;
  if (patch.noLaterThan !== undefined) next.noLaterThan = patch.noLaterThan;
  if (patch.lunchBreak !== undefined) next.lunchBreak = patch.lunchBreak;
  if (patch.bufferMinutes !== undefined) next.bufferMinutes = patch.bufferMinutes;
  if (patch.minNoticeHours !== undefined) next.minNoticeHours = patch.minNoticeHours;
  if (patch.excludedDates !== undefined) next.excludedDates = patch.excludedDates;

  group.set('constraints', next);
  await group.save();
  return group.constraints;
}
