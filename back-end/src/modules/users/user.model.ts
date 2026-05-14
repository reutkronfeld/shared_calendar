import { Schema, model, Types, type HydratedDocument } from 'mongoose';

export interface RefreshTokenEnc {
  iv: string;
  data: string;
}

export interface User {
  _id: Types.ObjectId;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  refreshToken?: RefreshTokenEnc;
  defaultTimeZone: string;
  onboardedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RefreshTokenSchema = new Schema<RefreshTokenEnc>(
  {
    iv: { type: String, required: true },
    data: { type: String, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema<User>(
  {
    googleId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    picture: { type: String },
    refreshToken: { type: RefreshTokenSchema, required: false },
    defaultTimeZone: { type: String, default: 'Asia/Jerusalem' },
    onboardedAt: { type: Date, required: false },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<User>;

export const UserModel = model<User>('User', UserSchema);
