// Central place every page/script reads the backend URL, Google client ID,
// and Paystack key from. Local dev (127.0.0.1 / localhost, any port — e.g.
// the Live Server default of 127.0.0.1:5501) automatically talks to your
// local backend instead of production, so you never have to hand-edit URLs
// per file when your local dev port changes again.
const LOSUB_LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];
const LOSUB_IS_LOCAL = LOSUB_LOCAL_HOSTNAMES.includes(window.location.hostname);

// If your local backend runs on a different port, change it here only.
const LOSUB_LOCAL_BACKEND_PORT = 3000;

const API_ORIGIN = LOSUB_IS_LOCAL
  ? `http://127.0.0.1:${LOSUB_LOCAL_BACKEND_PORT}`
  : "https://api.losubapp.com";

const API_BASE_URL = `${API_ORIGIN}/api`;

const GOOGLE_CLIENT_ID = "342069621439-d4lt30bg3vffskon1gmf9p4v0ftgros3.apps.googleusercontent.com";

const PAYSTACK_PUBLIC_KEY = "pk_live_54aa197d81011d9e56ba5da9f0a3fbe6fa56f283";