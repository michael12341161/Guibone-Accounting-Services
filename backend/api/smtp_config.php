<?php
// Local SMTP config fallback for XAMPP / development.
// IMPORTANT: Do not commit real credentials to a public repository.
// Set these values via environment variables or a .env file.

return [
  'SMTP_USER' => getenv('SMTP_USER') ?: '',
  'SMTP_PASS' => getenv('SMTP_PASS') ?: '',
  'SMTP_HOST' => getenv('SMTP_HOST') ?: 'smtp.gmail.com',
  'SMTP_PORT' => (int)(getenv('SMTP_PORT') ?: 587),
];
