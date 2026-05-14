import { Schema, model, Types, type HydratedDocument } from 'mongoose';

export type OverrideType = 'busy' | 'free';

export interface AvailabilityOverride {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  start: Date;
  end: Date;
  type: OverrideType;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AvailabilityOverrideSchema = new Schema<AvailabilityOverride>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    type: { type: String, enum: ['busy', 'free'], required: true },
    note: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);

AvailabilityOverrideSchema.index({ userId: 1, start: 1 });

export type AvailabilityOverrideDoc = HydratedDocument<AvailabilityOverride>;

export const AvailabilityOverrideModel = model<AvailabilityOverride>(
  'AvailabilityOverride',
  AvailabilityOverrideSchema,
);
