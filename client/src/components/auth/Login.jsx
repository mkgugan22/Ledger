import { useState } from "react";
import { Button, Card, Form, Alert } from "react-bootstrap";
import { Landmark, LockKeyhole } from "lucide-react";
import { login, register } from "../../lib/api.js";

export default function Login({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = mode === "login"
        ? await login({ email, password })
        : await register({ name, email, password });
      onAuthenticated(result.user);
    } catch (err) {
      setError(err.message || "Unable to authenticate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lg-auth-shell d-flex align-items-center justify-content-center p-3">
      <Card className="lg-auth-card shadow-sm">
        <Card.Body className="p-4 p-md-5">
          <div className="text-center mb-4">
            <Landmark size={30} color="var(--lg-brass)" />
            <h1 className="font-serif mt-2 mb-1">Ledger</h1>
            <p className="text-secondary small mb-0">Your household book, kept private.</p>
          </div>
          {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
          <Form onSubmit={submit}>
            {mode === "register" && (
              <Form.Group className="mb-3">
                <Form.Label>Name</Form.Label>
                <Form.Control value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Form.Group>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <div className="input-group">
                <span className="input-group-text"><LockKeyhole size={15} /></span>
                <Form.Control type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
              </div>
              {mode === "register" && <Form.Text>Use at least 8 characters.</Form.Text>}
            </Form.Group>
            <Button type="submit" className="w-100" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</Button>
          </Form>
          <button className="btn btn-link btn-sm w-100 mt-3" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "New to Ledger? Create an account" : "Already have an account? Sign in"}
          </button>
        </Card.Body>
      </Card>
    </main>
  );
}
