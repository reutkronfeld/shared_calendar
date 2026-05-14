import { Schema, model, Types, type HydratedDocument } from 'mongoose';

export type MembershipRole = 'organizer' | 'member';

export interface Membership {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  userId: Types.ObjectId;
  role: MembershipRole;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<Membership>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['organizer', 'member'], default: 'member', required: true },
    joinedAt: { type: Date, default: () => new Date(), required: true },
  },
  { timestamps: true },
);

MembershipSchema.index({ groupId: 1, userId: 1 }, { unique: true });

export type MembershipDoc = HydratedDocument<Membership>;

export const MembershipModel = model<Membership>('Membership', MembershipSchema);
