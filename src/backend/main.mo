import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Nat "mo:core/Nat";

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

  // --- Stable state (Map is stable in mo:core) ---
  let usersByEmail = Map.empty<Text, UserRecord>();
  let usersById    = Map.empty<Text, UserRecord>();
  let sessions     = Map.empty<Text, SessionRecord>();
  var tokenCounter : Nat = 0;

  let THIRTY_DAYS_NS : Int = 30 * 24 * 60 * 60 * 1_000_000_000;

  func makeToken() : Text {
    tokenCounter += 1;
    "sess_" # tokenCounter.toText() # "_" # Time.now().toText()
  };

  // --- Public API ---

  public func registerUser(email : Text, passwordHash : Text, displayName : Text) : async AuthResult {
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

  public func loginUser(email : Text, passwordHash : Text) : async LoginResult {
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
};
