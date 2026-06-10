/* DEVERSE — serverless GitHub OAuth token exchange (Vercel Node function).
 *
 * The browser sends the authorization `code` here; we swap it for an access
 * token using the *server-only* client secret, then read the user's public
 * profile and repositories and return a normalised profile. The access token
 * never leaves the server. Configure with the GITHUB_CLIENT_ID /
 * GITHUB_CLIENT_SECRET environment variables (see .env.example). */

const GH = "https://api.github.com";

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "OAuth is not configured on the server." }));
  }

  let code = "";
  let redirectUri = "";
  try {
    const body = await readJson(req);
    code = body.code || "";
    redirectUri = body.redirect_uri || "";
  } catch {
    /* fall through to the missing-code error below */
  }
  if (!code) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Missing authorization code." }));
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }),
    });
    const tokenJson = await tokenRes.json();
    const token = tokenJson.access_token;
    if (!token) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: tokenJson.error_description || "Token exchange was rejected." }));
    }

    const gh = (path) =>
      fetch(GH + path, {
        headers: {
          authorization: "Bearer " + token,
          accept: "application/vnd.github+json",
          "user-agent": "deverse",
        },
      });

    const userRes = await gh("/user");
    if (!userRes.ok) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "Could not read the GitHub profile." }));
    }
    const user = await userRes.json();

    let repos = [];
    const reposRes = await gh("/user/repos?per_page=100&sort=pushed&type=owner");
    if (reposRes.ok) repos = await reposRes.json();

    res.statusCode = 200;
    return res.end(JSON.stringify(normalize(user, repos)));
  } catch {
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: "GitHub request failed." }));
  }
}

/* Read and JSON-parse the request body (raw Node stream). */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/* Collapse the GitHub user + repos payloads into DEVERSE's profile shape.
 * Mirrors normalizeProfile() in src/github.js — keep the two in sync. */
function normalize(user, repos) {
  let stars = 0;
  const langCount = {};
  for (const r of repos || []) {
    if (r.fork) continue;
    stars += r.stargazers_count || 0;
    if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
  }
  const langs = Object.keys(langCount)
    .sort((a, b) => langCount[b] - langCount[a])
    .slice(0, 6);
  return {
    login: user.login,
    github_id: user.id,
    name: user.name || user.login,
    avatar_url: user.avatar_url,
    bio: user.bio || "",
    html_url: user.html_url,
    location: user.location || "",
    company: user.company || "",
    created_at: user.created_at,
    public_repos: user.public_repos || (repos ? repos.length : 0),
    followers: user.followers || 0,
    stars,
    langs,
  };
}
