<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function appointmentHasDescriptionColumn(PDO $conn): bool {
  static $cached = null;
  if ($cached !== null) {
    return $cached;
  }

  try {
    $check = $conn->query("SHOW COLUMNS FROM appointment LIKE 'Description'");
    $cached = (bool)($check && $check->fetch(PDO::FETCH_ASSOC));
  } catch (Throwable $e) {
    $cached = false;
  }

  return $cached;
}

function documentsTableExists(PDO $conn): bool {
  static $cached = null;
  if ($cached !== null) {
    return $cached;
  }

  try {
    $check = $conn->query("SHOW TABLES LIKE 'documents'");
    $cached = (bool)($check && $check->fetch(PDO::FETCH_NUM));
  } catch (Throwable $e) {
    $cached = false;
  }

  return $cached;
}

function documentsHasAppointmentColumn(PDO $conn): bool {
  static $cached = null;
  if ($cached !== null) {
    return $cached;
  }

  try {
    $check = $conn->query("SHOW COLUMNS FROM documents LIKE 'appointment_id'");
    $cached = (bool)($check && $check->fetch(PDO::FETCH_ASSOC));
  } catch (Throwable $e) {
    $cached = false;
  }

  return $cached;
}

try {
  monitoring_require_auth();
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
  }

  // Validate appointment id
  $appointment_id = isset($_POST['appointment_id']) ? trim($_POST['appointment_id']) : '';
  if ($appointment_id === '' || !ctype_digit((string)$appointment_id)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'appointment_id is required']);
    exit;
  }

  if (!isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No file uploaded']);
    exit;
  }

  $exists = $conn->prepare('SELECT Appointment_ID, Client_ID FROM appointment WHERE Appointment_ID = :id LIMIT 1');
  $exists->execute([':id' => (int)$appointment_id]);
  $appointmentRow = $exists->fetch(PDO::FETCH_ASSOC);
  if (!$appointmentRow) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Appointment not found']);
    exit;
  }
  monitoring_require_client_access((int)($appointmentRow['Client_ID'] ?? 0), [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);

  $hasDescription = appointmentHasDescriptionColumn($conn);
  $hasDocumentsTable = documentsTableExists($conn);
  if (!$hasDocumentsTable) {
    http_response_code(500);
    echo json_encode([
      'success' => false,
      'message' => 'documents table is required for appointment file uploads',
    ]);
    exit;
  }
  if (!documentsHasAppointmentColumn($conn)) {
    http_response_code(500);
    echo json_encode([
      'success' => false,
      'message' => 'documents table must include appointment_id to link uploaded files',
    ]);
    exit;
  }

  $file = $_FILES['file'];
  if (!empty($file['error'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Upload error: ' . $file['error']]);
    exit;
  }

  $maxBytes = 10 * 1024 * 1024; // 10MB
  if ((int)$file['size'] > $maxBytes) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'File too large. Max 10MB']);
    exit;
  }

  $originalName = (string)($file['name'] ?? '');
  $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

  // Allowed extensions for docs/spreadsheets/images
  $allowedExt = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
  if (!in_array($ext, $allowedExt, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid file type. Allowed: ' . implode(', ', $allowedExt)]);
    exit;
  }

  // Generate safe file name
  $safeBase = preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($originalName, PATHINFO_FILENAME));
  $safeBase = trim($safeBase, '_');
  if ($safeBase === '') $safeBase = 'file';
  $unique = bin2hex(random_bytes(8));
  $storedName = 'appt_' . $appointment_id . '_' . $unique . '_' . $safeBase . '.' . $ext;
  // Make sure upload dir exists
  $baseDir = realpath(__DIR__ . '/..'); // backend/
  $uploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'appointment_files';
  if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
      throw new Exception('Failed to create upload directory');
    }
  }

  $destPath = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
  if (!move_uploaded_file((string)($file['tmp_name'] ?? ''), $destPath)) {
    throw new Exception('Failed to save uploaded file');
  }

  // Store in DB: uses existing Appointment.Description to avoid schema changes.
  $publicRelativePath = 'uploads/appointment_files/' . $storedName; // relative to backend/
  $metaLine = "[Attachment] " . $publicRelativePath;

  // Keep an upload record in documents table, linked to appointment_id.
  $documentId = null;
  $docStmt = $conn->prepare('INSERT INTO documents (appointment_id, filename, filepath) VALUES (:appointment_id, :filename, :filepath)');
  $docStmt->execute([
    ':appointment_id' => (int)$appointment_id,
    ':filename' => $originalName,
    ':filepath' => $publicRelativePath,
  ]);
  $documentId = (int)$conn->lastInsertId();

  // Backward compatibility for screens still reading attachment from appointment.Description.
  if ($hasDescription) {
    $stmt = $conn->prepare("UPDATE appointment SET Description = CONCAT(COALESCE(Description,''), CASE WHEN COALESCE(Description,'') = '' THEN '' ELSE '\n' END, :meta) WHERE Appointment_ID = :id");
    $stmt->execute([
      ':meta' => $metaLine,
      ':id' => $appointment_id,
    ]);
  }

  echo json_encode([
    'success' => true,
    'message' => 'File uploaded',
    'document_id' => $documentId,
    'path' => $publicRelativePath,
    'original_name' => $originalName,
  ]);
} catch (Throwable $e) {
  error_log('appointment_upload_file error: ' . $e->getMessage());
  http_response_code(500);
  echo json_encode(['success' => false, 'message' => 'Server error']);
}
