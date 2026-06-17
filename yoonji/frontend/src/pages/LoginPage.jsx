import { useState } from "react";

import Button from "../components/common/Button";
import Input from "../components/common/Input";


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
        <Input
          autoComplete="username"
          label="로그인 ID"
          maxLength={50}
          minLength={3}
          name="login_id"
          onChange={handleChange}
          required
          value={form.login_id}
        />

        <Input
          autoComplete="current-password"
          label="비밀번호"
          maxLength={72}
          minLength={8}
          name="password"
          onChange={handleChange}
          required
          type="password"
          value={form.password}
        />

        <Button type="submit" isLoading={isSubmitting}>
          로그인
        </Button>
      </form>

      {message && <p className="form-message success">{message}</p>}
      {errorMessage && <p className="form-message error">{errorMessage}</p>}
    </section>
  );
}


export default LoginPage;
