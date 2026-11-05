import { useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Alert, ProgressBar } from "react-bootstrap";
import { ArrowLeft, Eye, EyeOff, KeyRound, Landmark, LockKeyhole, MailCheck, UserRoundPlus } from "lucide-react";
import {
  login,
  register,
  warmApi,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
} from "../../lib/api.js";
import LedgerMascot from "../onboarding/LedgerMascot.jsx";

function scorePassword(value) {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 12) score += 2;
  else if (value.length >= 8) score += 1;
  if (/[a-z]/.test(value)) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 6);
}

export default function Login({ onAuthenticated }) {
  const actionTokens = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return { verify: params.get("verify"), reset: params.get("reset") };
  }, []);
  useEffect(() => { warmApi().catch(() => {}); }, []);

  const [mode, setMode] = useState(actionTokens.reset ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(Boolean(actionTokens.verify));
  const [showPassword, setShowPassword] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [companionMood, setCompanionMood] = useState("idle");
  const [companionMessage, setCompanionMessage] = useState("Welcome to Ledger. Let's open your financial workspace.");
  const strength = scorePassword(password);
  const strengthLabel = ["", "Very weak", "Weak", "Fair", "Good", "Strong", "Very strong"][strength];

  useEffect(() => {
    if (!actionTokens.verify) return;
    let active = true;
    verifyEmail(actionTokens.verify)
      .then((result) => {
        if (active) {
          setMessage(result.message || "Your email address has been verified. You can sign in.");
          setError("");
        }
      })
      .catch((err) => {
        if (active) setError(err.message || "This verification link is invalid or has expired.");
      })
      .finally(() => {
        if (active) {
          setBusy(false);
          window.history.replaceState({}, "", window.location.pathname);
        }
      });
    return () => { active = false; };
  }, [actionTokens.verify]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    if (mode === "login") {
      setCompanionMood("thinking");
      setCompanionMessage("Checking your sign-in details…");
    }
    try {
      if (mode === "login") {
        const result = await login({ email, password });
        setLoginAttempts(0);
        setCompanionMood("happy");
        setCompanionMessage("You're in! Welcome back.");
        if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          await new Promise((resolve) => window.setTimeout(resolve, 550));
        }
        onAuthenticated(result.user);
      } else if (mode === "register") {
        if (password !== confirmPassword) throw new Error("The passwords do not match.");
        const result = await register({ name, email, password });
        if (result.verificationRequired) {
          setMessage(result.message || "Check your inbox for a verification link before signing in.");
          setCompanionMood("happy");
          setCompanionMessage("Account created! Check your inbox to verify your email.");
          setMode("login");
        } else {
          setCompanionMood("happy");
          setCompanionMessage("Your Ledger is ready. Let's get started!");
          if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            await new Promise((resolve) => window.setTimeout(resolve, 450));
          }
          onAuthenticated(result.user);
        }
      } else if (mode === "forgot") {
        const result = await requestPasswordReset(email);
        setMessage(result.message || "Check your inbox for a password reset link.");
      } else if (mode === "resend") {
        const result = await resendVerification(email);
        setMessage(result.message || "If the account needs verification, a new link will be sent.");
      } else if (mode === "reset") {
        if (password !== confirmPassword) throw new Error("The passwords do not match.");
        const result = await resetPassword(actionTokens.reset, password);
        setMessage(result.message || "Password updated. Please sign in again.");
        setPassword("");
        setConfirmPassword("");
        setMode("login");
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (err) {
      setError(err.message || "Unable to complete the request.");
      if (mode === "login" && err.status === 401) {
        const nextAttempts = loginAttempts + 1;
        setLoginAttempts(nextAttempts);
        setCompanionMood(nextAttempts >= 3 ? "angry" : "sad");
        setCompanionMessage(nextAttempts >= 3
          ? "That still doesn't match. Let's double-check your details."
          : "That didn't match. Check your email and password, then try again.");
      } else if (mode === "login") {
        setCompanionMood("concerned");
        setCompanionMessage("I couldn't sign you in just now. Let's try again.");
      }
      if (err.code === "EMAIL_VERIFICATION_REQUIRED") setMode("resend");
    } finally {
      setBusy(false);
    }
  }

  const isPasswordMode = mode === "login" || mode === "register" || mode === "reset";
  const heading = {
    login: "Welcome back",
    register: "Create your account",
    forgot: "Reset your password",
    resend: "Verify your email",
    reset: "Choose a new password",
  }[mode];

  function switchMode(next) {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setCompanionMood(next === "register" ? "curious" : "idle");
    setCompanionMessage(next === "register" ? "Let's set up your Ledger account." : "I'm ready when you are.");
  }

  return (
    <main className="lg-auth-shell d-flex align-items-center justify-content-center p-3">
      <Card className="lg-auth-card shadow-sm" style={{ position: "relative", zIndex: 1 }}>
        <Card.Body className="p-4 p-md-5">
          <div className="text-center mb-4">
            <div className={`lg-login-companion ilc-mood-${companionMood}`} aria-live="polite">
              <div className="lg-login-message" role="status">{companionMessage}</div>
              <LedgerMascot mood={companionMood} />
            </div>
            <Landmark size={30} color="var(--lg-brass)" />
            <h1 className="font-serif mt-2 mb-1">Ledger</h1>
            <p className="text-secondary small mb-0">Your household book, kept private.</p>
            <h2 className="h5 mt-4 mb-0">{heading}</h2>

          </div>

          {error && <Alert variant="danger" className="py-2 small" role="alert">{error}</Alert>}
          {message && <Alert variant="success" className="py-2 small" role="status">{message}</Alert>}

          {mode !== "reset" && actionTokens.verify && busy ? (
            <p className="text-center text-secondary small">Verifying your email address…</p>
          ) : (
            <Form onSubmit={submit}>
              {(mode === "register") && (
                <Form.Group className="mb-3">
                  <Form.Label>Name</Form.Label>
                  <Form.Control value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={80} />
                </Form.Group>
              )}

              {mode !== "reset" && (
                <Form.Group className="mb-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </Form.Group>
              )}

              {isPasswordMode && (
                <Form.Group className="mb-3">
                  <Form.Label>{mode === "reset" ? "New password" : "Password"}</Form.Label>
                  <div className="input-group">
                    <span className="input-group-text"><LockKeyhole size={15} /></span>
                    <Form.Control
                      type={showPassword ? "text" : "password"}
                      minLength={mode === "login" ? 1 : 12}
                      maxLength={72}
                      value={password}
                      onFocus={() => { if (mode === "login" && companionMood !== "angry" && companionMood !== "sad") { setCompanionMood("curious"); setCompanionMessage("I'll keep an eye on your sign-in."); } }}
                      onChange={(e) => { setPassword(e.target.value); if (mode === "login" && loginAttempts === 0) { setCompanionMood("thinking"); setCompanionMessage("Take your time. Your password stays private."); } }}
                      required
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                    />
                    <button type="button" className="lg-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {mode !== "login" && (
                    <>
                      <Form.Text>Use 12–72 UTF-8 bytes. A mix of letters, numbers and symbols is recommended.</Form.Text>
                      <ProgressBar className="mt-2" now={(strength / 6) * 100} variant={strength < 3 ? "danger" : strength < 5 ? "warning" : "success"} aria-label={"Password strength: " + strengthLabel} />
                      <div className="small text-secondary mt-1" aria-live="polite">{password ? "Password strength: " + strengthLabel : "Password strength"}</div>
                    </>
                  )}
                </Form.Group>
              )}

              {(mode === "reset" || mode === "register") && (
                <Form.Group className="mb-3">
                  <Form.Label>{mode === "reset" ? "Confirm new password" : "Confirm password"}</Form.Label>
                  <div className="input-group">
                    <Form.Control
                      type={showPassword ? "text" : "password"}
                      minLength={12}
                      maxLength={72}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  {mode === "register" && password && confirmPassword && password !== confirmPassword && (
                    <div className="small text-danger mt-1" role="status">Passwords do not match yet.</div>
                  )}
                </Form.Group>
              )}

              <Button type="submit" className="w-100" disabled={busy || (mode === "reset" && !actionTokens.reset)}>
                {busy ? "Please wait…" : {
                  login: "Sign in",
                  register: "Create account",
                  forgot: "Send reset link",
                  resend: "Send verification link",
                  reset: "Update password",
                }[mode]}
              </Button>
            </Form>
          )}

          <div className="lg-auth-links mt-4">
            {mode === "login" && (
              <>
                <div className="lg-auth-quick-actions">
                  <button type="button" className="lg-auth-action-card" onClick={() => switchMode("forgot")}>
                    <span className="lg-auth-action-icon"><KeyRound size={17} /></span>
                    <span className="lg-auth-action-copy">
                      <strong>Forgot password?</strong>
                      <small>Get a password reset link</small>
                    </span>
                  </button>
                  <button type="button" className="lg-auth-action-card" onClick={() => switchMode("resend")}>
                    <span className="lg-auth-action-icon"><MailCheck size={17} /></span>
                    <span className="lg-auth-action-copy">
                      <strong>Verify your email</strong>
                      <small>Resend the verification link</small>
                    </span>
                  </button>
                </div>
                <button type="button" className="lg-auth-create-link" onClick={() => switchMode("register")}>
                  <UserRoundPlus size={17} />
                  <span>New to Ledger? <strong>Create an account</strong></span>
                </button>
              </>
            )}
            {mode !== "login" && (
              <button type="button" className="lg-auth-back-link" onClick={() => switchMode("login")}>
                <ArrowLeft size={16} /> Back to sign in
              </button>
            )}
          </div>
        </Card.Body>
      </Card>
    </main>
  );
}
