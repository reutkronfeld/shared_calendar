import { Schema, model, Types, type HydratedDocument } from 'mongoose';

export interface GroupConstraints {
  /** ISO weekday numbers to exclude (0 = Sunday … 6 = Saturday). */
  excludedWeekdays: number[];
  /** Earliest minute-of-day the slot can START (local time, 0-1439). */
  noEarlierThan: number;
  /** Latest minute-of-day the slot can END (local time, 1-1440, exclusive). */
  noLaterThan: number;
  /** Skip slots that fall inside the lunch window (minute-of-day). */
  lunchBreak: { enabled: boolean; startMinute: number; endMinute: number };
  /** Minimum buffer (minutes) around any busy event. */
  bufferMinutes: number;
  /** Skip slots that start within the next N hours from "now". */
  minNoticeHours: number;
  /** Specific YYYY-MM-DD dates to exclude (group-level holidays / blackouts). */
  excludedDates: string[];
}

export const DEFAULT_CONSTRAINTS: GroupConstraints = {
  excludedWeekdays: [5, 6], // Fri, Sat (IL weekend)
  noEarlierThan: 9 * 60,
  noLaterThan: 20 * 60,
  lunchBreak: { enabled: false, startMinute: 12 * 60, endMinute: 13 * 60 },
  bufferMinutes: 0,
  minNoticeHours: 2,
  excludedDates: [],
};

export interface Group {
  _id: Types.ObjectId;
  code: string;
  name: string;
  organizerId: Types.ObjectId;
  constraints: GroupConstraints;
  createdAt: Date;
  updatedAt: Date;
}

const ConstraintsSchema = new Schema<GroupConstraints>(
  {
    excludedWeekdays: { type: [Number], default: () => [5, 6] },
    noEarlierThan: { type: Number, default: 9 * 60, min: 0, max: 1439 },
    noLaterThan: { type: Number, default: 20 * 60, min: 1, max: 1440 },
    lunchBreak: {
      enabled: { type: Boolean, default: false },
      startMinute: { type: Number, default: 12 * 60, min: 0, max: 1439 },
      endMinute: { type: Number, default: 13 * 60, min: 1, max: 1440 },
    },
    bufferMinutes: { type: Number, default: 0, min: 0, max: 240 },
    minNoticeHours: { type: Number, default: 2, min: 0, max: 24 * 14 },
    excludedDates: { type: [String], default: () => [] },
  },
  { _id: false },
);

const GroupSchema = new Schema<Group>(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    constraints: { type: ConstraintsSchema, default: () => DEFAULT_CONSTRAINTS },
  },
  { timestamps: true },
);

export type GroupDoc = HydratedDocument<Group>;

export const GroupModel = model<Group>('Group', GroupSchema);
