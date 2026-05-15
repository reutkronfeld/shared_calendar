import { Schema, model, type Types, Document } from 'mongoose';

export interface IPendingMember {
  userId: Types.ObjectId;
  eventId: string;
  summary: string;
  originalStart: Date;
  originalEnd: Date;
  status: 'pending' | 'accepted' | 'declined';
}

export interface INegotiationSession extends Document {
  groupId: Types.ObjectId;
  creatorId: Types.ObjectId;
  title: string;
  slotStart: Date;
  slotEnd: Date;
  durationMinutes: number;
  location?: string;
  pendingMembers: IPendingMember[];
  status: 'active' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const PendingMemberSchema = new Schema<IPendingMember>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: String, required: true },
  summary: { type: String, required: true },
  originalStart: { type: Date, required: true },
  originalEnd: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
});

const NegotiationSessionSchema = new Schema<INegotiationSession>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    slotStart: { type: Date, required: true },
    slotEnd: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    location: { type: String },
    pendingMembers: [PendingMemberSchema],
    status: { type: String, enum: ['active', 'completed', 'failed'], default: 'active' },
  },
  { timestamps: true },
);

export const NegotiationSessionModel = model<INegotiationSession>(
  'NegotiationSession',
  NegotiationSessionSchema,
);
