import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";

import Map "mo:core/Map";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
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

  // --- Stable state (Map is stable in mo:core) ---

  let usersByEmail = Map.empty<Text, UserRecord>();
  let usersById = Map.empty<Text, UserRecord>();
  let sessions = Map.empty<Text, SessionRecord>();
  var tokenCounter : Nat = 0;
  var videoCounter : Nat = 0;
  var commentCounter : Nat = 0;

  let videos = Map.empty<Text, VideoRecord>();

  // Map Principal to userId for authorization
  let principalToUserId = Map.empty<Principal, Text>();

  let THIRTY_DAYS_NS : Int = 365 * 24 * 60 * 60 * 1_000_000_000;

  func makeToken() : Text {
    tokenCounter += 1;
    "sess_" # tokenCounter.toText() # "_" # Time.now().toText()
  };

  // Helper to get userId from Principal
  func getUserIdFromPrincipal(principal : Principal) : ?Text {
    principalToUserId.get(principal)
  };

  // --- Public API ---

  public shared ({ caller }) func registerUser(email : Text, passwordHash : Text, displayName : Text) : async AuthResult {
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
    principalToUserId.add(caller, userId);
    #ok(userId)
  };

  public shared ({ caller }) func loginUser(email : Text, passwordHash : Text) : async LoginResult {
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
          expiresAt = Time.now() + THIRTY_DAYS_NS;
        };
        sessions.add(token, session);
        principalToUserId.add(caller, user.userId);
        #ok({ token; userId = user.userId; displayName = user.displayName })
      };
    }
  };

  public func validateSession(token : Text) : async ProfileResult {
    switch (sessions.get(token)) {
      case null { return #err("Invalid session") };
      case (?sess) {
        if (Time.now() > sess.expiresAt) {
          sessions.remove(token);
          return #err("Session expired");
        };
        switch (usersById.get(sess.userId)) {
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

  public shared ({ caller }) func addVideo(videoInput : VideoInput) : async VideoRecord {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can add videos");
    };

    // Verify the caller is the creator
    switch (getUserIdFromPrincipal(caller)) {
      case null {
        Runtime.trap("Unauthorized: User not found");
      };
      case (?userId) {
        if (userId != videoInput.creatorId) {
          Runtime.trap("Unauthorized: Cannot create video for another user");
        };
      };
    };

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

  public shared ({ caller }) func updateVideoStatus(input : VideoUpdateInput) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can update videos");
    };

    switch (videos.get(input.videoId)) {
      case (null) { false };
      case (?video) {
        // Only the creator or admin can update
        let isCreator = switch (getUserIdFromPrincipal(caller)) {
          case null { false };
          case (?userId) { userId == video.creatorId };
        };
        let isAdmin = AccessControl.isAdmin(accessControlState, caller);

        if (not (isCreator or isAdmin)) {
          Runtime.trap("Unauthorized: Only the video creator or admin can update this video");
        };

        let updatedVideo = { video with videoUrl = input.videoUrl; status = input.status };
        videos.add(input.videoId, updatedVideo);
        true;
      };
    };
  };

  public shared ({ caller }) func deleteVideo(videoId : Text) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can delete videos");
    };

    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        // Only the creator or admin can delete
        let isCreator = switch (getUserIdFromPrincipal(caller)) {
          case null { false };
          case (?userId) { userId == video.creatorId };
        };
        let isAdmin = AccessControl.isAdmin(accessControlState, caller);

        if (not (isCreator or isAdmin)) {
          Runtime.trap("Unauthorized: Only the video creator or admin can delete this video");
        };

        videos.remove(videoId);
        true;
      };
    };
  };

  public shared ({ caller }) func toggleLike(videoId : Text) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can like videos");
    };

    let userId = switch (getUserIdFromPrincipal(caller)) {
      case null {
        Runtime.trap("Unauthorized: User not found");
      };
      case (?id) { id };
    };

    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        let hasLiked = video.likedBy.find(func(id) { id == userId }).isSome();
        let updatedLikedBy = if (hasLiked) { video.likedBy.filter(func(id) { id != userId }) } else { video.likedBy.concat([userId]) };
        let updatedLikes = if (hasLiked) {
          video.likes - 1;
        } else {
          video.likes + 1;
        };
        let updatedVideo = { video with likedBy = updatedLikedBy; likes = updatedLikes };
        videos.add(videoId, updatedVideo);
        true;
      };
    };
  };

  public shared ({ caller }) func toggleDislike(videoId : Text) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can dislike videos");
    };

    let userId = switch (getUserIdFromPrincipal(caller)) {
      case null {
        Runtime.trap("Unauthorized: User not found");
      };
      case (?id) { id };
    };

    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        let hasDisliked = video.dislikedBy.find(func(id) { id == userId }).isSome();
        let updatedDislikedBy = if (hasDisliked) { video.dislikedBy.filter(func(id) { id != userId }) } else {
          video.dislikedBy.concat([userId]);
        };
        let updatedDislikes = if (hasDisliked) { video.dislikes - 1 } else {
          video.dislikes + 1;
        };
        let updatedVideo = { video with dislikedBy = updatedDislikedBy; dislikes = updatedDislikes };
        videos.add(videoId, updatedVideo);
        true;
      };
    };
  };

  public shared ({ caller }) func addComment(videoId : Text, text : Text) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can comment");
    };

    let userId = switch (getUserIdFromPrincipal(caller)) {
      case null {
        Runtime.trap("Unauthorized: User not found");
      };
      case (?id) { id };
    };

    let authorName = switch (usersById.get(userId)) {
      case null {
        Runtime.trap("User profile not found");
      };
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

  public shared ({ caller }) func incrementViewCount(videoId : Text) : async Bool {
    // Views can be incremented by anyone, including guests
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
