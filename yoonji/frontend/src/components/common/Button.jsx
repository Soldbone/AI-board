function Button({
  children,
  className = "",
  disabled = false,
  isLoading = false,
  type = "button",
  variant = "primary",
  ...props
}) {
  const classes = [
    "ui-button",
    `ui-button-${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? "처리 중" : children}
    </button>
  );
}


export default Button;
