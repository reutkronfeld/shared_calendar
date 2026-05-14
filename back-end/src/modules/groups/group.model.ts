import { Schema, model, Types, type HydratedDocument } from 'mongoose';

export interface Group {
  _id: Types.ObjectId;
  code: string;
  name: string;
  organizerId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<Group>(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
);

export type GroupDoc = HydratedDocument<Group>;

export const GroupModel = model<Group>('Group', GroupSchema);
