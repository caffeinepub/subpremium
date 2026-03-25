import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";

import Map "mo:core/Map";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Float "mo:core/Float";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";


actor {
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  // --- Types ---
  type UserRecord = {
    userId : Text;
    email : Text;
    passwordHash : Text;
    displayName : Text;
    createdAt : Int;
  };

  type SessionRecord = {
    token : Text;
    userId : Text;
    expiresAt : Int;
  };

  type UserProfile = {
    userId : Text;
    email : Text;
    displayName : Text;
  };

  type AuthResult = { #ok : Text; #err : Text };
  type LoginResult = { #ok : { token : Text; userId : Text; displayName : Text }; #err : Text };
  type ProfileResult = { #ok : UserProfile; #err : Text };

  // Video types
  type Comment = {
    commentId : Text;
    text : Text;
    authorId : Text;
    authorName : Text;
    createdAt : Int;
  };

  type VideoRecord = {
    videoId : Text;
    title : Text;
    description : Text;
    creatorId : Text;
    creatorName : Text;
    videoUrl : Text;
    thumbnailUrl : Text;
    durationSeconds : Nat;
    fileSizeBytes : Nat;
    views : Nat;
    likes : Nat;
    dislikes : Nat;
    createdAt : Int;
    status : Text;
    blobHash : Text;
    comments : [Comment];
    likedBy : [Text];
    dislikedBy : [Text];
    isPremium : Bool;
  };

  // Video input types
  type VideoInput = {
    title : Text;
    description : Text;
    creatorId : Text;
    creatorName : Text;
    thumbnailUrl : Text;
    durationSeconds : Nat;
    fileSizeBytes : Nat;
    blobHash : Text;
    isPremium : Bool;
  };

  type VideoUpdateInput = {
    videoId : Text;
    videoUrl : Text;
    status : Text;
  };

  // --- User data persistence types ---
  type HistoryEntry = {
    videoId : Text;
    watchedAt : Int;
  };

  type WatchProgressEntry = {
    videoId : Text;
    progressTime : Float;
    durationSeconds : Float;
    updatedAt : Int;
  };

  type PlaylistRecord = {
    playlistId : Text;
    name : Text;
    videoIds : [Text];
    createdAt : Int;
  };

  type UserData = {
    userId : Text;
    username : Text;
    avatarUrl : Text;
    watchLater : [Text];
    history : [HistoryEntry];
    playlists : [PlaylistRecord];
  };

  // --- Stable state ---

  let usersByEmail = Map.empty<Text, UserRecord>();
  let usersById = Map.empty<Text, UserRecord>();
  let sessions = Map.empty<Text, SessionRecord>();
  var tokenCounter : Nat = 0;
  var videoCounter : Nat = 0;
  var commentCounter : Nat = 0;

  let videos = Map.empty<Text, VideoRecord>();

  // Kept for stable variable compatibility with previous deployment
  let THIRTY_DAYS_NS : Int = 365 * 24 * 60 * 60 * 1_000_000_000;
  let principalToUserId = Map.empty<Principal, Text>();

  let ONE_YEAR_NS : Int = 365 * 24 * 60 * 60 * 1_000_000_000;

  // User data maps
  let userDataMap = Map.empty<Text, UserData>();
  let watchProgressMap = Map.empty<Text, WatchProgressEntry>();

  func makeToken() : Text {
    tokenCounter += 1;
    "sess_" # tokenCounter.toText() # "_" # Time.now().toText()
  };

  // Validate session token and return userId, or null if invalid
  func validateToken(token : Text) : ?Text {
    switch (sessions.get(token)) {
      case null { null };
      case (?sess) {
        if (Time.now() > sess.expiresAt) {
          sessions.remove(token);
          null
        } else {
          ?sess.userId
        }
      };
    }
  };

  // --- Public API ---

  public shared func registerUser(email : Text, passwordHash : Text, displayName : Text) : async AuthResult {
    switch (usersByEmail.get(email)) {
      case (?_) { return #err("Email already registered") };
      case null {};
    };
    tokenCounter += 1;
    let userId = "u_" # Time.now().toText() # "_" # tokenCounter.toText();
    let record : UserRecord = {
      userId;
      email;
      passwordHash;
      displayName;
      createdAt = Time.now();
    };
    usersByEmail.add(email, record);
    usersById.add(userId, record);
    #ok(userId)
  };

  public shared func loginUser(email : Text, passwordHash : Text) : async LoginResult {
    switch (usersByEmail.get(email)) {
      case null { return #err("Invalid email or password") };
      case (?user) {
        if (user.passwordHash != passwordHash) {
          return #err("Invalid email or password");
        };
        let token = makeToken();
        let session : SessionRecord = {
          token;
          userId = user.userId;
          expiresAt = Time.now() + ONE_YEAR_NS;
        };
        sessions.add(token, session);
        #ok({ token; userId = user.userId; displayName = user.displayName })
      };
    }
  };

  public func validateSession(token : Text) : async ProfileResult {
    switch (validateToken(token)) {
      case null { return #err("Invalid or expired session") };
      case (?userId) {
        switch (usersById.get(userId)) {
          case null { return #err("User not found") };
          case (?user) {
            #ok({ userId = user.userId; email = user.email; displayName = user.displayName })
          };
        }
      };
    }
  };

  public func logoutUser(token : Text) : async () {
    sessions.remove(token);
  };

  public func getUserProfile(token : Text) : async ProfileResult {
    await validateSession(token)
  };

  // --- User data persistence API ---

  public query func getUserAllData(userId : Text) : async ?UserData {
    userDataMap.get(userId)
  };

  public shared func updateUserExtra(token : Text, username : Text, avatarUrl : Text) : async Bool {
    switch (validateToken(token)) {
      case null { false };
      case (?userId) {
        let existing = switch (userDataMap.get(userId)) {
          case null {
            {
              userId;
              username = "";
              avatarUrl = "";
              watchLater = [];
              history = [];
              playlists = [];
            }
          };
          case (?d) { d };
        };
        userDataMap.add(userId, { existing with username; avatarUrl });
        true
      };
    }
  };

  public shared func saveUserData(
    token : Text,
    watchLater : [Text],
    history : [HistoryEntry],
    playlists : [PlaylistRecord],
  ) : async Bool {
    switch (validateToken(token)) {
      case null { false };
      case (?userId) {
        let existing = switch (userDataMap.get(userId)) {
          case null {
            {
              userId;
              username = "";
              avatarUrl = "";
              watchLater = [];
              history = [];
              playlists = [];
            }
          };
          case (?d) { d };
        };
        userDataMap.add(userId, { existing with watchLater; history; playlists });
        true
      };
    }
  };

  public shared func saveWatchProgress(
    token : Text,
    videoId : Text,
    progressTime : Float,
    durationSeconds : Float,
  ) : async Bool {
    switch (validateToken(token)) {
      case null { false };
      case (?userId) {
        let key = userId # "_" # videoId;
        let entry : WatchProgressEntry = {
          videoId;
          progressTime;
          durationSeconds;
          updatedAt = Time.now();
        };
        watchProgressMap.add(key, entry);
        true
      };
    }
  };

  public query func getWatchProgressAll(userId : Text) : async [WatchProgressEntry] {
    let prefix = userId # "_";
    watchProgressMap.entries()
      .filter(func((k, _v)) { k.startsWith(#text prefix) })
      .map(func((_k, v)) { v })
      .toArray()
  };

  // --- Video API (no principal-based auth — uses creatorId from input) ---

  public shared func addVideo(videoInput : VideoInput) : async VideoRecord {
    videoCounter += 1;
    let videoId = videoCounter.toText();

    let video : VideoRecord = {
      videoId;
      title = videoInput.title;
      description = videoInput.description;
      creatorId = videoInput.creatorId;
      creatorName = videoInput.creatorName;
      videoUrl = "";
      thumbnailUrl = videoInput.thumbnailUrl;
      durationSeconds = videoInput.durationSeconds;
      fileSizeBytes = videoInput.fileSizeBytes;
      views = 0;
      likes = 0;
      dislikes = 0;
      createdAt = Time.now();
      status = "uploading";
      blobHash = videoInput.blobHash;
      comments = [];
      likedBy = [];
      dislikedBy = [];
      isPremium = videoInput.isPremium;
    };

    videos.add(videoId, video);
    video;
  };

  public query func getVideo(videoId : Text) : async ?VideoRecord {
    videos.get(videoId);
  };

  public query func getAllVideos() : async [VideoRecord] {
    videos.values().toArray();
  };

  public query func getVideosByCreator(creatorId : Text) : async [VideoRecord] {
    videos.values().filter(func(video) { video.creatorId == creatorId }).toArray();
  };

  public shared func updateVideoStatus(input : VideoUpdateInput) : async Bool {
    switch (videos.get(input.videoId)) {
      case (null) { false };
      case (?video) {
        let updatedVideo = { video with videoUrl = input.videoUrl; status = input.status };
        videos.add(input.videoId, updatedVideo);
        true;
      };
    };
  };

  public shared func deleteVideo(videoId : Text) : async Bool {
    switch (videos.get(videoId)) {
      case (null) { false };
      case (?_video) {
        videos.remove(videoId);
        true;
      };
    };
  };

  // userId is passed explicitly (anonymous principal is unreliable for multi-user)
  public shared func toggleLike(videoId : Text, userId : Text) : async Bool {
    if (userId == "") { return false };
    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        let hasLiked = video.likedBy.find(func(id) { id == userId }).isSome();
        let updatedLikedBy = if (hasLiked) { video.likedBy.filter(func(id) { id != userId }) } else { video.likedBy.concat([userId]) };
        let updatedLikes = if (hasLiked) { video.likes - 1 } else { video.likes + 1 };
        let updatedVideo = { video with likedBy = updatedLikedBy; likes = updatedLikes };
        videos.add(videoId, updatedVideo);
        true;
      };
    };
  };

  public shared func toggleDislike(videoId : Text, userId : Text) : async Bool {
    if (userId == "") { return false };
    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        let hasDisliked = video.dislikedBy.find(func(id) { id == userId }).isSome();
        let updatedDislikedBy = if (hasDisliked) { video.dislikedBy.filter(func(id) { id != userId }) } else {
          video.dislikedBy.concat([userId]);
        };
        let updatedDislikes = if (hasDisliked) { video.dislikes - 1 } else { video.dislikes + 1 };
        let updatedVideo = { video with dislikedBy = updatedDislikedBy; dislikes = updatedDislikes };
        videos.add(videoId, updatedVideo);
        true;
      };
    };
  };

  public shared func addComment(videoId : Text, text : Text, userId : Text) : async Bool {
    if (userId == "") { return false };
    let authorName = switch (usersById.get(userId)) {
      case null { "Anonymous" };
      case (?user) { user.displayName };
    };

    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        commentCounter += 1;
        let commentId = commentCounter.toText();

        let comment : Comment = {
          commentId;
          text;
          authorId = userId;
          authorName;
          createdAt = Time.now();
        };

        let newComments = [comment].concat(video.comments);
        let updatedVideo = { video with comments = newComments };
        videos.add(videoId, updatedVideo);
        true;
      };
    };
  };

  public query func getComments(videoId : Text) : async [Comment] {
    switch (videos.get(videoId)) {
      case (null) { [] };
      case (?video) { video.comments };
    };
  };

  public shared func incrementViewCount(videoId : Text) : async Bool {
    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        let updatedVideo = { video with views = video.views + 1 };
        videos.add(videoId, updatedVideo);
        true;
      };
    };
  };

  public query func searchVideos(searchTerm : Text) : async [VideoRecord] {
    videos.values().filter(func(video) { video.title.contains(#text searchTerm) }).toArray();
  };
};
