const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();

const dbPath = path.join(__dirname, "twitterClone.db");
app.use(express.json());
let db = null;

const initializeServerAndDB = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB error: ${error.message}`);
    process.exit(1);
  }
};

initializeServerAndDB();

const authenticator = (request, response, next) => {
  const header = request.headers["authorization"];
  let jwtToken;

  if (header !== undefined) {
    jwtToken = header.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "IronMan", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const getTweet = (each) => {
  return {
    username: each.username,
    tweet: each.tweet,
    dateTime: each.date_time,
  };
};

//Create User API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const userDb = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;

  const length = password.length;

  const user = await db.get(userDb);

  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const addUser = `
                 INSERT INTO user(name, username, password, gender)
                 VALUES('${name}', '${username}', '${hashedPassword}', '${gender}');
             `;

      await db.run(addUser);

      response.send("User created successfully");
    }
  }
});

//Login User API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const userDb = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;

  const dbUser = await db.get(userDb);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isMatched = await bcrypt.compare(password, dbUser.password);

    if (isMatched === true) {
      const payload = { username: username };

      const jwtToken = jwt.sign(payload, "IronMan");

      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Tweets API
app.get("/user/tweets/feed/", authenticator, async (request, response) => {
  const { username } = request;

  const userIdQuery = `
         SELECT user_id
         FROM user
         WHERE username = '${username}';
  `;

  const userIdObject = await db.get(userIdQuery);

  const userId = userIdObject.user_id;

  const getFollowingUser = `
        SELECT following_user_id
        FROM follower
        WHERE follower.follower_user_id = ${userId};
  `;

  const followingUserIdObject = await db.all(getFollowingUser);

  const followingUserId = followingUserIdObject.map(
    (each) => each.following_user_id
  );

  const getLatestTweets = `
        SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
        FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        INNER JOIN user ON follower.following_user_id = user.user_id
        WHERE follower.following_user_id IN (${followingUserId})
        GROUP BY tweet.tweet_id
        ORDER BY tweet.date_time DESC
        LIMIT 4;
  `;

  const tweets = await db.all(getLatestTweets);

  response.send(tweets);
});

const getUser = (user) => {
  return {
    name: user.name,
  };
};

//Following API
app.get("/user/following/", authenticator, async (request, response) => {
  const { username } = request;

  const userIdQuery = `
         SELECT user_id
         FROM user
         WHERE username = '${username}';
  `;

  const userIdObject = await db.get(userIdQuery);

  const userId = userIdObject.user_id;

  const getFollowingUser = `
        SELECT following_user_id
        FROM follower
        WHERE follower.follower_user_id = ${userId};
  `;

  const followingUserIdObject = await db.all(getFollowingUser);

  const followingUserId = followingUserIdObject.map(
    (each) => each.following_user_id
  );

  const result = `
       SELECT user.name
       FROM user
       WHERE user.user_id IN (${followingUserId})
       GROUP BY user.user_id
  `;

  const followingUserObject = await db.all(result);

  response.send(followingUserObject.map((user) => getUser(user)));
});

//Followers API
app.get("/user/followers/", authenticator, async (request, response) => {
  const { username } = request;

  const userIdQuery = `
         SELECT user_id
         FROM user
         WHERE username = '${username}';
  `;

  const userIdObject = await db.get(userIdQuery);

  const userId = userIdObject.user_id;

  const getFollowers = `
        SELECT follower.follower_user_id
        FROM follower
        WHERE follower.following_user_id = ${userId};
    `;

  const followersIdObject = await db.all(getFollowers);

  const followersId = followersIdObject.map((each) => each.follower_user_id);

  console.log(followersId);

  const getFollowersName = `
          SELECT user.name
          FROM user
          WHERE user_id IN (${followersId});
    `;

  const followers = await db.all(getFollowersName);

  response.send(followers);
});

//Get Tweet API ---------
app.get("/tweets/:tweetId/", authenticator, async (request, response) => {
  const { tweetId } = request.params;

  const { username } = request;

  const userIdQuery = `
         SELECT user_id
         FROM user
         WHERE username = '${username}';
  `;

  const userIdObject = await db.get(userIdQuery);
  const userId = userIdObject.user_id;

  const usersFromTweet = `
      SELECT user_id
      FROM tweet
      WHERE tweet_id = ${tweetId};
  `;

  const tweetOwner = await db.get(usersFromTweet);

  const ownerId = tweetOwner.user_id;

  const followingUser = `
      SELECT follower_id
      FROM follower
      WHERE follower_user_id = ${userId} AND following_user_id = ${ownerId};
  `;

  const check = await db.get(followingUser);

  if (check === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweet = `
            SELECT tweet, date_time AS dateTime
            FROM tweet
            WHERE tweet_id = ${tweetId};
        `;

    const likes = `
            SELECT COUNT() AS likes
            FROM like
            WHERE tweet_id = ${tweetId};
        `;

    const replies = `
            SELECT COUNT() AS replies
            FROM reply
            WHERE tweet_id = ${tweetId};
        `;

    const t = await db.get(tweet);
    const l = await db.get(likes);
    const r = await db.get(replies);

    response.send({
      tweet: t.tweet,
      likes: l.likes,
      replies: r.replies,
      dateTime: t.dateTime,
    });
  }
});

// Likes API
app.get("/tweets/:tweetId/likes/", authenticator, async (request, response) => {
  const { tweetId } = request.params;

  const { username } = request;

  const userIdQuery = `
         SELECT user_id
         FROM user
         WHERE username = '${username}';
  `;

  const userIdObject = await db.get(userIdQuery);

  const userId = userIdObject.user_id;

  const getFollowingUser = `
        SELECT following_user_id
        FROM follower
        WHERE follower.follower_user_id = ${userId};
  `;

  const followingUserIdObject = await db.all(getFollowingUser);

  const followingUserId = followingUserIdObject.map(
    (each) => each.following_user_id
  );

  const sam2 = `
         SELECT DISTINCT tweet_id
         FROM tweet
         WHERE user_id IN (${followingUserId})
  `;

  const tweetsIdObject = await db.all(sam2);

  const tweetsIdFromDb = tweetsIdObject.map((each) => each.tweet_id);

  if (tweetsIdFromDb.includes(parseInt(tweetId))) {
    const rQuery = `
           SELECT user.username
           FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
           INNER JOIN user ON like.user_id = user.user_id
           WHERE tweet.tweet_id = ${tweetId}
           GROUP BY like.user_id;
       `;

    const usernamesObject = await db.all(rQuery);

    const likesArray = usernamesObject.map((each) => each.username);

    response.send({ likes: likesArray });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//Reply API
app.get(
  "/tweets/:tweetId/replies/",
  authenticator,
  async (request, response) => {
    const { tweetId } = request.params;

    const { username } = request;

    const userIdQuery = `
         SELECT user_id
         FROM user
         WHERE username = '${username}';
  `;

    const userIdObject = await db.get(userIdQuery);

    const userId = userIdObject.user_id;

    const getFollowingUser = `
        SELECT following_user_id
        FROM follower
        WHERE follower.follower_user_id = ${userId};
  `;

    const followingUserIdObject = await db.all(getFollowingUser);

    const followingUserId = followingUserIdObject.map(
      (each) => each.following_user_id
    );

    const sam2 = `
         SELECT DISTINCT tweet_id
         FROM tweet
         WHERE user_id IN (${followingUserId})
  `;

    const tweetsIdObject = await db.all(sam2);

    const tweetsIdFromDb = tweetsIdObject.map((each) => each.tweet_id);

    if (tweetsIdFromDb.includes(parseInt(tweetId))) {
      const rQuery = `
           SELECT user.name, reply.reply
           FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
           INNER JOIN user ON reply.user_id = user.user_id
           WHERE tweet.tweet_id = ${tweetId}
           GROUP BY reply.user_id;
       `;

      const usernamesObject = await db.all(rQuery);

      const repliesArray = usernamesObject.map((each) => ({
        name: each.name,
        reply: each.reply,
      }));

      response.send({ replies: repliesArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

const details = async (each) => {
  const tweet = `
            SELECT tweet, date_time AS dateTime
            FROM tweet
            WHERE tweet_id = ${each};
        `;

  const likes = `
            SELECT COUNT() AS likes
            FROM like
            WHERE tweet_id = ${each};
        `;

  const replies = `
            SELECT COUNT() AS replies
            FROM reply
            WHERE tweet_id = ${each};
        `;

  const t = await db.get(tweet);
  const l = await db.get(likes);
  const r = await db.get(replies);

  return {
    tweet: t.tweet,
    likes: l.likes,
    replies: r.replies,
    dateTime: t.dateTime,
  };
};

//Tweets of the User API ----------
app.get("/user/tweets/", authenticator, async (request, response) => {
  const { username } = request;

  const userIdQuery = `
            SELECT user_id
            FROM user
            WHERE username = '${username}';
    `;

  const userIdObject = await db.get(userIdQuery);
  const userId = userIdObject.user_id;

  const a = `
    SELECT tweet_id
    FROM tweet
    WHERE user_id = ${userId};  
`;

  const userTweetsObject = await db.all(a);

  const tweetId = userTweetsObject.map((each) => details(each.tweet_id));
  console.log(tweetId);
});

//Create Tweet API
app.post("/user/tweets/", authenticator, async (request, response) => {
  const { tweet } = request.body;

  const { username } = request;

  const userIdQuery = `
                SELECT user_id
                FROM user
                WHERE username = '${username}';
        `;

  const userIdObject = await db.get(userIdQuery);
  const userId = userIdObject.user_id;

  const dateTime = new Date();

  const year = dateTime.getFullYear();
  const month = dateTime.getMonth();
  const day = dateTime.getDay();
  const hour = dateTime.getHours();
  const minute = dateTime.getMinutes();
  const second = dateTime.getSeconds();

  const date = `${year}-${month}-${day} ${hour}:${minute}:${second}`;

  const createTweet = `
      INSERT INTO tweet(tweet, user_id, date_time)
      VALUES('${tweet}', ${userId}, '${date}');
  `;

  await db.run(createTweet);
  response.send("Created a Tweet");
});

//Delete Tweet API
app.delete("/tweets/:tweetId/", authenticator, async (request, response) => {
  const { tweetId } = request.params;

  const { username } = request;

  const userIdQuery = `
                    SELECT user_id
                    FROM user
                    WHERE username = '${username}';
            `;

  const userIdObject = await db.get(userIdQuery);
  const userId = userIdObject.user_id;

  const tweetQuery = `
        SELECT user_id
        FROM tweet
        WHERE tweet_id = ${tweetId};
    `;

  const userIdForTweet = await db.get(tweetQuery);

  if (userIdForTweet.user_id === userId) {
    const deleteTweet = `
             DELETE FROM tweet
             WHERE tweet_id = ${tweetId};
        `;

    await db.run(deleteTweet);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
