import { useState } from "react";


const INITIAL_FORM = {
  login_id: "",
  password: "",
};


function LoginPage({ onLogin }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setErrorMessage("");

    try {
      await onLogin(form);
      setForm(INITIAL_FORM);
      setMessage("로그인되었습니다.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <h2 id="login-title">로그인</h2>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          로그인 ID
          <input
            name="login_id"
            value={form.login_id}
            onChange={handleChange}
            minLength={3}
            maxLength={50}
            required
          />
        </label>

        <label>
          비밀번호
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            minLength={8}
            maxLength={72}
            required
          />
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "로그인 중" : "로그인"}
        </button>
      </form>

      {message && <p className="form-message success">{message}</p>}
      {errorMessage && <p className="form-message error">{errorMessage}</p>}
    </section>
  );
}


export default LoginPage;
