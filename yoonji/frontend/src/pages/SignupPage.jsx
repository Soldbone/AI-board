import { useState } from "react";

import Button from "../components/common/Button";
import Input from "../components/common/Input";


const INITIAL_FORM = {
  email: "",
  login_id: "",
  password: "",
  nickname: "",
};


function SignupPage({ onSignup }) {
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
      const user = await onSignup(form);
      setForm(INITIAL_FORM);
      setMessage(`${user.nickname} 계정이 생성되었습니다.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="signup-title">
      <h2 id="signup-title">회원가입</h2>
      <form className="auth-form" onSubmit={handleSubmit}>
        <Input
          autoComplete="email"
          label="이메일"
          name="email"
          onChange={handleChange}
          required
          type="email"
          value={form.email}
        />

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
          autoComplete="new-password"
          label="비밀번호"
          maxLength={72}
          minLength={8}
          name="password"
          onChange={handleChange}
          required
          type="password"
          value={form.password}
        />

        <Input
          autoComplete="nickname"
          label="닉네임"
          maxLength={50}
          minLength={2}
          name="nickname"
          onChange={handleChange}
          required
          value={form.nickname}
        />

        <Button type="submit" isLoading={isSubmitting}>
          회원가입
        </Button>
      </form>

      {message && <p className="form-message success">{message}</p>}
      {errorMessage && <p className="form-message error">{errorMessage}</p>}
    </section>
  );
}


export default SignupPage;
