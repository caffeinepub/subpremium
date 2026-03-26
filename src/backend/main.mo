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

  // SessionRecord must remain compatible with the previous deployed shape
  // (token, userId, expiresAt only). Refresh token data lives in a separate map.
  type SessionRecord = {
    token : Text;
    userId : Text;
    expiresAt : Int;
  };

  // Separate record for refresh token data (new stable map, no migration issue)
  type RefreshRecord = {
    refreshToken : Text;
    accessToken : Text;
    userId : Text;
    refreshExpiresAt : Int;
  };

  type UserProfile = {
    userId : Text;
    email : Text;
    displayName : Text;
  };

  type AuthResult = { #ok : Text; #err : Text };
  type LoginResult = { #ok : { token : Text; refreshToken : Text; userId : Text; displayName : Text }; #err : Text };
  type ProfileResult = { #ok : UserProfile; #err : Text };
  type RefreshResult = { #ok : { token : Text; refreshToken : Text; userId : Text; displayName : Text }; #err : Text };

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

  type SubscriptionEntry = {
    creatorId : Text;
    creatorName : Text;
  };

  type UserData = {
    userId : Text;
    username : Text;
    avatarUrl : Text;
    watchLater : [Text];
    history : [HistoryEntry];
    playlists : [PlaylistRecord];
  };

  type UserSettings = {
    accountPublic : Bool;
    allowComments : Bool;
    allowDownloads : Bool;
    autoplayVideos : Bool;
    videoQuality : Text;
    videoQualityWifi : Text;
    videoQualityMobile : Text;
    subtitlesLanguage : Text;
    subtitleDefaultLanguage : Text;
    appLanguage : Text;
    darkMode : Bool;
    fontSize : Text;
    preferredLanguages : [Text];
  };

  // --- STABLE state (persists across upgrades/deploys) ---

  // Kept for stable variable compatibility with previous deployment
  let THIRTY_DAYS_NS : Int = 30 * 24 * 60 * 60 * 1_000_000_000;

  stable var usersByEmail = Map.empty<Text, UserRecord>();
  stable var usersById = Map.empty<Text, UserRecord>();

  // sessions uses the original SessionRecord shape (token, userId, expiresAt)
  // DO NOT add fields here — use refreshSessions for new data
  stable var sessions = Map.empty<Text, SessionRecord>();

  // New map for refresh tokens (separate to avoid migration issues)
  stable var refreshSessions = Map.empty<Text, RefreshRecord>();

  stable var tokenCounter : Nat = 0;
  stable var videoCounter : Nat = 0;
  stable var commentCounter : Nat = 0;

  stable var videos = Map.empty<Text, VideoRecord>();

  stable var principalToUserId = Map.empty<Principal, Text>();

  let ONE_YEAR_NS : Int = 365 * 24 * 60 * 60 * 1_000_000_000;
  let ACCESS_TOKEN_TTL : Int = 7 * 24 * 60 * 60 * 1_000_000_000; // 7 days

  stable var userDataMap = Map.empty<Text, UserData>();
  stable var userSubscriptionsMap = Map.empty<Text, [SubscriptionEntry]>();
  stable var watchProgressMap = Map.empty<Text, WatchProgressEntry>();
  stable var userSettingsMap = Map.empty<Text, UserSettings>();

  func makeToken() : Text {
    tokenCounter += 1;
    "sess_" # tokenCounter.toText() # "_" # Time.now().toText()
  };

  func makeRefreshToken() : Text {
    tokenCounter += 1;
    "ref_" # tokenCounter.toText() # "_" # Time.now().toText()
  };

  // Validate access token — returns userId or null
  func validateToken(token : Text) : ?Text {
    switch (sessions.get(token)) {
      case null { null };
      case (?sess) {
        if (Time.now() > sess.expiresAt) { null } else { ?sess.userId }
      };
    }
  };

  // Get userId from token even if expired (for data writes with lenient auth)
  func getUserIdFromToken(token : Text) : ?Text {
    switch (validateToken(token)) {
      case (?id) { ?id };
      case null {
        switch (sessions.get(token)) {
          case null { null };
          case (?sess) { ?sess.userId };
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
        let refreshToken = makeRefreshToken();
        let session : SessionRecord = {
          token;
          userId = user.userId;
          expiresAt = Time.now() + ACCESS_TOKEN_TTL;
        };
        let refresh : RefreshRecord = {
          refreshToken;
          accessToken = token;
          userId = user.userId;
          refreshExpiresAt = Time.now() + ONE_YEAR_NS;
        };
        sessions.add(token, session);
        refreshSessions.add(refreshToken, refresh);
        #ok({ token; refreshToken; userId = user.userId; displayName = user.displayName })
      };
    }
  };

  public func validateSession(token : Text) : async ProfileResult {
    switch (sessions.get(token)) {
      case null { return #err("Invalid session") };
      case (?sess) {
        switch (usersById.get(sess.userId)) {
          case null { return #err("User not found") };
          case (?user) {
            #ok({ userId = user.userId; email = user.email; displayName = user.displayName })
          };
        }
      };
    }
  };

  // Refresh access token using refresh token
  public shared func refreshSession(refreshToken : Text) : async RefreshResult {
    switch (refreshSessions.get(refreshToken)) {
      case null { return #err("Invalid refresh token") };
      case (?ref) {
        if (Time.now() > ref.refreshExpiresAt) {
          refreshSessions.remove(refreshToken);
          sessions.remove(ref.accessToken);
          return #err("Refresh token expired");
        };
        // Remove old access token session
        sessions.remove(ref.accessToken);
        // Issue new tokens
        let newToken = makeToken();
        let newRefreshToken = makeRefreshToken();
        let newSession : SessionRecord = {
          token = newToken;
          userId = ref.userId;
          expiresAt = Time.now() + ACCESS_TOKEN_TTL;
        };
        let newRefresh : RefreshRecord = {
          refreshToken = newRefreshToken;
          accessToken = newToken;
          userId = ref.userId;
          refreshExpiresAt = Time.now() + ONE_YEAR_NS;
        };
        refreshSessions.remove(refreshToken);
        sessions.add(newToken, newSession);
        refreshSessions.add(newRefreshToken, newRefresh);
        switch (usersById.get(ref.userId)) {
          case null { #err("User not found") };
          case (?user) {
            #ok({ token = newToken; refreshToken = newRefreshToken; userId = user.userId; displayName = user.displayName })
          };
        }
      };
    }
  };

  public func logoutUser(token : Text) : async () {
    // Also clean up associated refresh session
    for ((rk, rv) in refreshSessions.entries()) {
      if (rv.accessToken == token) {
        refreshSessions.remove(rk);
      };
    };
    sessions.remove(token);
  };

  // Full account deletion — removes user, all their videos, sessions, and all user data
  public shared func deleteUserAccount(token : Text) : async Bool {
    let userIdOpt = getUserIdFromToken(token);
    switch (userIdOpt) {
      case null { return false };
      case (?userId) {
        // Get user record to find email
        switch (usersById.get(userId)) {
          case null { return false };
          case (?user) {
            // Delete all videos owned by this user
            let userVideoIds : [Text] = videos.entries()
              .filter(func((_k, v)) { v.creatorId == userId })
              .map(func((k, _v)) { k })
              .toArray();
            for (videoId in userVideoIds.vals()) {
              videos.remove(videoId);
            };

            // Delete all access sessions for this user
            let sessionTokens : [Text] = sessions.entries()
              .filter(func((_k, v)) { v.userId == userId })
              .map(func((k, _v)) { k })
              .toArray();
            for (t in sessionTokens.vals()) {
              sessions.remove(t);
            };

            // Delete all refresh sessions for this user
            let refreshKeys : [Text] = refreshSessions.entries()
              .filter(func((_k, v)) { v.userId == userId })
              .map(func((k, _v)) { k })
              .toArray();
            for (rk in refreshKeys.vals()) {
              refreshSessions.remove(rk);
            };

            // Delete user data
            userDataMap.remove(userId);
            userSubscriptionsMap.remove(userId);
            userSettingsMap.remove(userId);

            // Delete watch progress entries for this user
            let progressKeys : [Text] = watchProgressMap.keys()
              .filter(func(k) { k.startsWith(#text (userId # "_")) })
              .toArray();
            for (pk in progressKeys.vals()) {
              watchProgressMap.remove(pk);
            };

            // Delete user records
            usersByEmail.remove(user.email);
            usersById.remove(userId);

            true
          };
        }
      };
    }
  };

  public func getUserProfile(token : Text) : async ProfileResult {
    await validateSession(token)
  };

  // --- User data persistence API ---

  public query func getUserAllData(userId : Text) : async ?UserData {
    userDataMap.get(userId)
  };

  public shared func updateUserExtra(token : Text, username : Text, avatarUrl : Text) : async Bool {
    switch (getUserIdFromToken(token)) {
      case null { false };
      case (?userId) {
        let existing = switch (userDataMap.get(userId)) {
          case null { { userId; username = ""; avatarUrl = ""; watchLater = []; history = []; playlists = [] } };
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
    switch (getUserIdFromToken(token)) {
      case null { false };
      case (?userId) {
        let existing = switch (userDataMap.get(userId)) {
          case null { { userId; username = ""; avatarUrl = ""; watchLater = []; history = []; playlists = [] } };
          case (?d) { d };
        };
        userDataMap.add(userId, { existing with watchLater; history; playlists });
        true
      };
    }
  };

  public shared func saveUserSubscriptions(
    token : Text,
    subscriptions : [SubscriptionEntry],
  ) : async Bool {
    switch (getUserIdFromToken(token)) {
      case null { false };
      case (?userId) {
        userSubscriptionsMap.add(userId, subscriptions);
        true
      };
    }
  };

  public query func getUserSubscriptions(userId : Text) : async [SubscriptionEntry] {
    switch (userSubscriptionsMap.get(userId)) {
      case null { [] };
      case (?subs) { subs };
    }
  };

  public shared func saveWatchProgress(
    token : Text,
    videoId : Text,
    progressTime : Float,
    durationSeconds : Float,
  ) : async Bool {
    switch (getUserIdFromToken(token)) {
      case null { false };
      case (?userId) {
        let key = userId # "_" # videoId;
        watchProgressMap.add(key, { videoId; progressTime; durationSeconds; updatedAt = Time.now() });
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

  // --- Video API ---

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
        videos.add(input.videoId, { video with videoUrl = input.videoUrl; status = input.status });
        true;
      };
    };
  };

  public shared func deleteVideo(videoId : Text) : async Bool {
    switch (videos.get(videoId)) {
      case (null) { false };
      case (?_) { videos.remove(videoId); true };
    };
  };

  public shared func toggleLike(videoId : Text, userId : Text) : async Bool {
    if (userId == "") { return false };
    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        let hasLiked = video.likedBy.find(func(id) { id == userId }).isSome();
        let updatedLikedBy = if (hasLiked) { video.likedBy.filter(func(id) { id != userId }) } else { video.likedBy.concat([userId]) };
        let updatedLikes = if (hasLiked) { video.likes - 1 } else { video.likes + 1 };
        videos.add(videoId, { video with likedBy = updatedLikedBy; likes = updatedLikes });
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
        let updatedDislikedBy = if (hasDisliked) { video.dislikedBy.filter(func(id) { id != userId }) } else { video.dislikedBy.concat([userId]) };
        let updatedDislikes = if (hasDisliked) { video.dislikes - 1 } else { video.dislikes + 1 };
        videos.add(videoId, { video with dislikedBy = updatedDislikedBy; dislikes = updatedDislikes });
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
        let comment : Comment = {
          commentId = commentCounter.toText();
          text;
          authorId = userId;
          authorName;
          createdAt = Time.now();
        };
        videos.add(videoId, { video with comments = [comment].concat(video.comments) });
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
        videos.add(videoId, { video with views = video.views + 1 });
        true;
      };
    };
  };

  public query func searchVideos(searchTerm : Text) : async [VideoRecord] {
    videos.values().filter(func(video) { video.title.contains(#text searchTerm) }).toArray();
  };

  // --- User settings persistence ---

  public shared func saveUserSettings(token : Text, settings : UserSettings) : async Bool {
    switch (getUserIdFromToken(token)) {
      case null { false };
      case (?userId) {
        userSettingsMap.add(userId, settings);
        true
      };
    }
  };

  public shared func updateVideoMeta(videoId : Text, title : Text, description : Text, thumbnailUrl : Text, requestingUserId : Text) : async Bool {
    if (requestingUserId == "") { return false };
    switch (videos.get(videoId)) {
      case (null) { false };
      case (?video) {
        if (video.creatorId != requestingUserId) { return false };
        let newTitle = if (title == "") { video.title } else { title };
        let newThumb = if (thumbnailUrl == "") { video.thumbnailUrl } else { thumbnailUrl };
        videos.add(videoId, { video with title = newTitle; description; thumbnailUrl = newThumb });
        true;
      };
    };
  };

  public query func getUserSettings(userId : Text) : async ?UserSettings {
    userSettingsMap.get(userId)
  };

};
