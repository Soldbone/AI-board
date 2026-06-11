import { useState } from "react";


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
        <label>
          이메일
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
          />
        </label>

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

        <label>
          닉네임
          <input
            name="nickname"
            value={form.nickname}
            onChange={handleChange}
            minLength={2}
            maxLength={50}
            required
          />
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "가입 중" : "회원가입"}
        </button>
      </form>

      {message && <p className="form-message success">{message}</p>}
      {errorMessage && <p className="form-message error">{errorMessage}</p>}
    </section>
  );
}


export default SignupPage;
