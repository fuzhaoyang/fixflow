const title = document.getElementById("auth-title");
const sub = document.getElementById("auth-sub");
const errBox = document.getElementById("auth-err");
const form = document.getElementById("auth-form");
const username = document.getElementById("auth-username");
const password = document.getElementById("auth-password");
const captchaInput = document.getElementById("auth-captcha");
const captchaImg = document.getElementById("auth-captcha-img");
const submit = document.getElementById("auth-submit");
const forgot = document.getElementById("auth-forgot");
const forgotLink = document.getElementById("auth-forgot-link");
const tip = document.getElementById("auth-tip");

let mode = "login";

function showErr(msg) {
  errBox.textContent = msg;
  errBox.classList.add("show");
}

function clearErr() {
  errBox.textContent = "";
  errBox.classList.remove("show");
}

function refreshCaptcha() {
  captchaImg.src = `/api/captcha?t=${Date.now()}`;
}

function setMode(m) {
  mode = m;
  clearErr();
  captchaInput.value = "";
  if (m === "login") {
    title.textContent = "登录 Fixflow";
    sub.textContent = "登录后即可使用服务器运维面板";
    submit.textContent = "登录";
    forgot.style.display = "";
    tip.innerHTML = "";
  } else {
    title.textContent = "注册 Fixflow";
    sub.textContent = "首次使用，设置面板登录账号";
    submit.textContent = "注册并登录";
    forgot.style.display = "none";
    tip.innerHTML = '<button type="button" id="auth-toggle">已有账号？去登录</button>';
    document.getElementById("auth-toggle").addEventListener("click", () => setMode("login"));
  }
  refreshCaptcha();
}

function setForgot() {
  clearErr();
  sub.textContent = "请在服务器上运行 fixflow reset-password 重置密码。";
}

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErr();
  const payload = {
    username: username.value.trim(),
    password: password.value,
    captchaCode: captchaInput.value.trim(),
  };
  submit.disabled = true;
  try {
    const r = await post(mode === "login" ? "api/login" : "api/register", payload);
    if (!r.ok) {
      showErr(r.data.error || "操作失败");
      refreshCaptcha();
      return;
    }
    if (mode === "register") {
      const login = await post("api/login", payload);
      if (!login.ok) { setMode("login"); showErr("注册成功，请登录"); return; }
    }
    location.href = "/";
  } finally {
    submit.disabled = false;
  }
});

(async () => {
  const res = await fetch("api/status");
  const data = await res.json();
  if (data.loggedIn) { location.href = "/"; return; }
  setMode(data.registered ? "login" : "register");
})();

captchaImg.addEventListener("click", refreshCaptcha);
forgotLink.addEventListener("click", setForgot);