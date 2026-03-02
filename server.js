const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: true }));

// --- session ---
app.use(session({
  secret: process.env.SESSION_SECRET || "dev_secret_change_me",
  resave: false,
  saveUninitialized: false
}));

// --- mongo ---
const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri || "mongodb://127.0.0.1:27017/linkmanager")
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// --- models ---
const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, unique: true },
  hash: String,
}));

const Link = mongoose.model("Link", new mongoose.Schema({
  userId: mongoose.Types.ObjectId,
  title: String,
  url: String,
  desc: String,
}));

// --- auth middleware ---
function authed(req, res, next) {
  if (!req.session.uid) return res.redirect("/");
  next();
}

// --- base template ---
function pageTemplate(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Link Manager</title>
    <link rel="icon" type="image/x-icon" href="./img.png">
  </head>
  <style>
    a {
      display: inline-block;
      max-width: 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
  <body>
    <h2 align="center">Link Manager</h2>
    ${body}
    <p align="center"><small>Demo app. Don’t use in production without hardening.</small></p>
    <script>
      function showEdit(id, title, url, desc) {
        document.getElementById('addSection').style.display = 'none';
        document.getElementById('editSection').style.display = 'block';
        document.getElementById('editId').value = id;
        document.getElementById('editTitle').value = title;
        document.getElementById('editUrl').value = url;
        document.getElementById('editDesc').value = desc;
        window.scrollTo(0,0);
      }
      function cancelEdit() {
        document.getElementById('addSection').style.display = 'block';
        document.getElementById('editSection').style.display = 'none';
      }
    </script>
  </body></html>`;
}

// --- home (login/register) ---
const home = (msg = "") => pageTemplate(`
${msg ? `<p align="center">${msg}</p>` : ""}
<div id="loginForm">
  <h3 align="center">Login</h3>
  <form method="post" action="/login">
    <table align="center" cellpadding="5">
      <tr><td>Email:</td><td><input name="email" required></td></tr>
      <tr><td>Password:</td><td><input name="pass" type="password" required></td></tr>
      <tr><td colspan="2" align="center"><button>Login</button> <a href="javascript:void(0)" onclick="showRegister()">Register</a></td></tr>
    </table>
  </form>
</div>
<div id="registerForm" style="display:none;">
  <h3 align="center">Register</h3>
  <form method="post" action="/register">
    <table align="center" cellpadding="5">
      <tr><td>Email:</td><td><input name="email" required></td></tr>
      <tr><td>Password:</td><td><input name="pass" type="password" required></td></tr>
      <tr><td colspan="2" align="center"><button>Register</button> <a href="javascript:void(0)" onclick="showLogin()">Back</a></td></tr>
    </table>
  </form>
</div>
<script>
function showRegister(){ document.getElementById("loginForm").style.display = "none"; document.getElementById("registerForm").style.display = "block"; }
function showLogin(){ document.getElementById("registerForm").style.display = "none"; document.getElementById("loginForm").style.display = "block"; }
</script>
`);

// --- dashboard ---
function dash(user, links, page, totalPages) {
  const rows = links.map(l => `<tr class="entry-row">
    <td>${l.title || ""}</td>
    <td><a href="${l.url || "#"}" target="_blank">${l.url || ""}</a></td>
    <td>${l.desc || ""}</td>
    <td>
      <button type="button" onclick="showEdit('${l._id}', '${l.title}', '${l.url}', '${l.desc}')">Edit</button>
      <a href="/del/${l._id}" onclick="return confirm('Delete?')">Delete</a>
    </td>
  </tr>`).join("");

  // Pagination navigation styled like the image
  const prev = page > 1 ? `<a href="/vault?page=${page - 1}">Prev</a>` : "";
  const next = page < totalPages ? `<a href="/vault?page=${page + 1}">Next</a>` : "";
  const nav = `<p align="center">${prev} Page ${page} of ${totalPages || 1} ${next}</p>`;

  return pageTemplate(`
<p align="center">
  Logged in as <b>${user.email}</b> | 
  <a href="/download">Download Backup (.txt)</a> | 
  <a href="/logout">Logout</a>
</p>

<div id="addSection">
  <h3 align="center">Add Link</h3>
  <form method="post" action="/add">
    <table align="center" cellpadding="5">
      <tr><td>Title:</td><td><input name="title" required></td></tr>
      <tr><td>URL:</td><td><input name="url" required></td></tr>
      <tr><td>Description:</td><td><input name="desc"></td></tr>
      <tr><td colspan="2" align="center"><button>Add</button></td></tr>
    </table>
  </form>
</div>

<div id="editSection" style="display:none; background:#f0f0f0; padding:10px; border:1px solid #ccc;">
  <h3 align="center">Edit Link</h3>
  <form method="post" action="/update">
    <input type="hidden" name="id" id="editId">
    <table align="center" cellpadding="5">
      <tr><td>Title:</td><td><input name="title" id="editTitle" required></td></tr>
      <tr><td>URL:</td><td><input name="url" id="editUrl" required></td></tr>
      <tr><td>Description:</td><td><input name="desc" id="editDesc"></td></tr>
      <tr><td colspan="2" align="center">
        <button>Update</button>
        <button type="button" onclick="cancelEdit()">Cancel</button>
      </td></tr>
    </table>
  </form>
</div>

<h3 align="center">Your Links</h3>
<div align="center" style="margin-bottom:10px;"><input type="text" id="searchBox" placeholder="Type to search..."></div>

<table border="1" cellpadding="6" cellspacing="0" align="center" id="entriesTable">
  <tr><th>Title</th><th>URL</th><th>Description</th><th>Actions</th></tr>
  ${rows || `<tr class="entry-row"><td colspan="4" align="center">No links found</td></tr>`}
</table>

${nav}

<script>
document.getElementById("searchBox").addEventListener("input", function() {
  const term = this.value.toLowerCase();
  document.querySelectorAll("#entriesTable .entry-row").forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
  });
});
</script>
`);
}

// --- routes ---
app.get("/", (req, res) => req.session.uid ? res.redirect("/vault") : res.send(home()));

app.post("/register", async (req, res) => {
  try {
    const { email, pass } = req.body;
    const hash = await bcrypt.hash(pass, 12);
    await User.create({ email, hash });
    res.send(home("Registered! Please login."));
  } catch (e) { res.send(home("Registration failed.")); }
});

app.post("/login", async (req, res) => {
  const { email, pass } = req.body;
  const u = await User.findOne({ email });
  if (!u || !(await bcrypt.compare(pass, u.hash))) return res.send(home("Invalid credentials"));
  req.session.uid = u._id.toString();
  res.redirect("/vault");
});

app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));

app.get("/vault", authed, async (req, res) => {
  const u = await User.findById(req.session.uid);
  
  // Pagination Math
  const limit = 20;
  const page = parseInt(req.query.page) || 1;
  const totalLinks = await Link.countDocuments({ userId: u._id });
  const totalPages = Math.ceil(totalLinks / limit);

  const links = await Link.find({ userId: u._id })
    .sort({ _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.send(dash(u, links, page, totalPages));
});

app.post("/add", authed, async (req, res) => {
  const { title, url, desc } = req.body;
  await Link.create({ userId: req.session.uid, title, url, desc });
  res.redirect("/vault");
});

app.post("/update", authed, async (req, res) => {
  const { id, title, url, desc } = req.body;
  await Link.updateOne({ _id: id, userId: req.session.uid }, { title, url, desc });
  res.redirect("/vault");
});

app.get("/del/:id", authed, async (req, res) => {
  await Link.deleteOne({ _id: req.params.id, userId: req.session.uid });
  res.redirect("/vault");
});

app.get("/download", authed, async (req, res) => {
  const links = await Link.find({ userId: req.session.uid }).sort({ _id: -1 });
  let text = "LINK MANAGER EXPORT\n===================\n\n";
  links.forEach(l => {
    text += `TITLE: ${l.title}\nURL: ${l.url}\nDESC: ${l.desc || ""}\n----------\n`;
  });
  res.setHeader("Content-Disposition", "attachment; filename=links.txt");
  res.type("text/plain").send(text);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running: http://localhost:${PORT}`));
