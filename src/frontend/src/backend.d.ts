import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface VideoInput {
    title: string;
    thumbnailUrl: string;
    isPremium: boolean;
    creatorId: string;
    fileSizeBytes: bigint;
    description: string;
    creatorName: string;
    blobHash: string;
    durationSeconds: bigint;
}
export interface VideoRecord {
    status: string;
    title: string;
    thumbnailUrl: string;
    views: bigint;
    isPremium: boolean;
    createdAt: bigint;
    creatorId: string;
    fileSizeBytes: bigint;
    description: string;
    likedBy: Array<string>;
    creatorName: string;
    blobHash: string;
    likes: bigint;
    durationSeconds: bigint;
    dislikedBy: Array<string>;
    comments: Array<Comment>;
    dislikes: bigint;
    videoUrl: string;
    videoId: string;
}
export type ProfileResult = {
    __kind__: "ok";
    ok: UserProfile;
} | {
    __kind__: "err";
    err: string;
};
export interface Comment {
    commentId: string;
    authorId: string;
    createdAt: bigint;
    text: string;
    authorName: string;
}
export interface VideoUpdateInput {
    status: string;
    videoUrl: string;
    videoId: string;
}
export type LoginResult = {
    __kind__: "ok";
    ok: {
        token: string;
        displayName: string;
        userId: string;
    };
} | {
    __kind__: "err";
    err: string;
};
export type AuthResult = {
    __kind__: "ok";
    ok: string;
} | {
    __kind__: "err";
    err: string;
};
export interface UserProfile {
    displayName: string;
    userId: string;
    email: string;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addComment(videoId: string, text: string): Promise<boolean>;
    addVideo(videoInput: VideoInput): Promise<VideoRecord>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    deleteVideo(videoId: string): Promise<boolean>;
    getAllVideos(): Promise<Array<VideoRecord>>;
    getCallerUserRole(): Promise<UserRole>;
    getComments(videoId: string): Promise<Array<Comment>>;
    getUserProfile(token: string): Promise<ProfileResult>;
    getVideo(videoId: string): Promise<VideoRecord | null>;
    getVideosByCreator(creatorId: string): Promise<Array<VideoRecord>>;
    incrementViewCount(videoId: string): Promise<boolean>;
    isCallerAdmin(): Promise<boolean>;
    loginUser(email: string, passwordHash: string): Promise<LoginResult>;
    logoutUser(token: string): Promise<void>;
    registerUser(email: string, passwordHash: string, displayName: string): Promise<AuthResult>;
    searchVideos(searchTerm: string): Promise<Array<VideoRecord>>;
    toggleDislike(videoId: string): Promise<boolean>;
    toggleLike(videoId: string): Promise<boolean>;
    updateVideoStatus(input: VideoUpdateInput): Promise<boolean>;
    validateSession(token: string): Promise<ProfileResult>;
}
