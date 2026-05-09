export const loginAnimStyles = `
@keyframes loginFadeUp {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes loginFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

@keyframes loginAurora {
  0% { transform: translate3d(-8%, -6%, 0) scale(1); }
  50% { transform: translate3d(8%, 6%, 0) scale(1.05); }
  100% { transform: translate3d(-8%, -6%, 0) scale(1); }
}

.login-fade-up {
  animation: loginFadeUp 700ms cubic-bezier(.2,.8,.2,1) both;
}

.login-fade-up-2 {
  animation: loginFadeUp 700ms cubic-bezier(.2,.8,.2,1) both;
  animation-delay: 120ms;
}

.login-fade-up-3 {
  animation: loginFadeUp 700ms cubic-bezier(.2,.8,.2,1) both;
  animation-delay: 220ms;
}

.login-blob {
  animation: loginFloat 8s ease-in-out infinite;
  will-change: transform;
}

.login-blob:nth-child(2) { animation-delay: -2s; }
.login-blob:nth-child(3) { animation-delay: -4s; }

.login-aurora {
  animation: loginAurora 10s ease-in-out infinite;
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .login-fade-up,
  .login-fade-up-2,
  .login-fade-up-3,
  .login-blob,
  .login-aurora {
    animation: none !important;
  }
}
`;
