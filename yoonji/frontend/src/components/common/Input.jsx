import { forwardRef, useId } from "react";


const Input = forwardRef(function Input(
  {
    className = "",
    errorMessage = "",
    helperText = "",
    id,
    label,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = [
    helperText ? `${inputId}-helper` : "",
    errorMessage ? `${inputId}-error` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={`field ${className}`.trim()} htmlFor={inputId}>
      {label && <span className="field-label">{label}</span>}
      <input
        aria-describedby={describedBy || undefined}
        aria-invalid={errorMessage ? "true" : undefined}
        id={inputId}
        ref={ref}
        {...props}
      />
      {helperText && (
        <span className="field-help" id={`${inputId}-helper`}>
          {helperText}
        </span>
      )}
      {errorMessage && (
        <span className="field-error" id={`${inputId}-error`}>
          {errorMessage}
        </span>
      )}
    </label>
  );
});


export default Input;
