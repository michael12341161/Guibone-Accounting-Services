-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 20, 2026 at 03:55 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `dbmonitoring`
--

-- --------------------------------------------------------

--
-- Table structure for table `announcements`
--

CREATE TABLE `announcements` (
  `announcement_ID` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `appointment`
--

CREATE TABLE `appointment` (
  `Appointment_ID` int(11) NOT NULL,
  `Client_ID` int(11) NOT NULL,
  `Services_type_Id` int(11) NOT NULL,
  `Status_ID` int(11) NOT NULL,
  `action_by` int(11) DEFAULT NULL,
  `Date` date NOT NULL,
  `Description` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `audit_logs_ID` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(255) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `device` varchar(100) DEFAULT NULL,
  `browser` varchar(100) DEFAULT NULL,
  `os` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `audit_logs`
--

INSERT INTO `audit_logs` (`audit_logs_ID`, `user_id`, `action`, `ip_address`, `location`, `device`, `browser`, `os`, `created_at`) VALUES
(1, 23, 'Blocked login due to client approval status', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-20 13:25:24'),
(2, 23, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-20 13:25:52'),
(3, 24, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-20 14:24:05');

-- --------------------------------------------------------

--
-- Table structure for table `business`
--

CREATE TABLE `business` (
  `Business_id` int(11) NOT NULL,
  `Client_ID` int(11) NOT NULL,
  `Brand_name` varchar(150) NOT NULL,
  `Business_type_ID` int(11) NOT NULL,
  `Status_id` int(11) DEFAULT NULL,
  `Province` varchar(150) DEFAULT NULL,
  `Municipality` varchar(150) DEFAULT NULL,
  `Postal_code` varchar(20) DEFAULT NULL,
  `Barangay` varchar(150) DEFAULT NULL,
  `Street_address` varchar(255) DEFAULT NULL,
  `Email_address` varchar(150) DEFAULT NULL,
  `TIN_number` varchar(50) DEFAULT NULL,
  `Contact_number` varchar(20) DEFAULT NULL,
  `Date_added` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `business`
--

INSERT INTO `business` (`Business_id`, `Client_ID`, `Brand_name`, `Business_type_ID`, `Status_id`, `Province`, `Municipality`, `Postal_code`, `Barangay`, `Street_address`, `Email_address`, `TIN_number`, `Contact_number`, `Date_added`) VALUES
(11, 10, 'FDMR', 1, 17, 'Agusan Del Norte', 'Butuan City (Capital)', '8600', 'Agao Pob. (Bgy. 3)', 'Zone 1', 'nacaya.michael123@gmail.com', '12323', '09354786152', '2026-03-20 13:25:13'),
(12, 11, 'O.G Old Gamer', 2, 18, 'Misamis Oriental', 'Cagayan De Oro City (Capital)', '9000', 'Bonbon', 'zone 1', 'domingo.ancog42@gmail.com', '123', '09354786152', '2026-03-20 14:22:53');

-- --------------------------------------------------------

--
-- Table structure for table `business_type`
--

CREATE TABLE `business_type` (
  `Business_type_ID` int(11) NOT NULL,
  `Business_name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `business_type`
--

INSERT INTO `business_type` (`Business_type_ID`, `Business_name`) VALUES
(1, 'Sole Proprietor'),
(2, 'Partnership'),
(3, 'Corporation');

-- --------------------------------------------------------

--
-- Table structure for table `civil_status_type`
--

CREATE TABLE `civil_status_type` (
  `civil_status_type_ID` int(11) NOT NULL,
  `civil_status_type_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `civil_status_type`
--

INSERT INTO `civil_status_type` (`civil_status_type_ID`, `civil_status_type_name`) VALUES
(1, 'Single'),
(2, 'Married'),
(3, 'Widowed'),
(4, 'Separated'),
(5, 'Divorced'),
(6, 'Annulled');

-- --------------------------------------------------------

--
-- Table structure for table `client`
--

CREATE TABLE `client` (
  `Client_ID` int(11) NOT NULL,
  `User_id` int(11) DEFAULT NULL,
  `First_name` varchar(100) NOT NULL,
  `Middle_name` varchar(100) DEFAULT NULL,
  `Last_name` varchar(100) NOT NULL,
  `Email` varchar(150) DEFAULT NULL,
  `Profile_Image` varchar(255) DEFAULT NULL,
  `Phone` varchar(20) DEFAULT NULL,
  `Date_of_Birth` date DEFAULT NULL,
  `civil_status_type_ID` int(11) DEFAULT NULL,
  `Province` varchar(150) DEFAULT NULL,
  `Municipality` varchar(150) DEFAULT NULL,
  `Postal_code` varchar(20) DEFAULT NULL,
  `Barangay` varchar(150) DEFAULT NULL,
  `Street_address` varchar(255) DEFAULT NULL,
  `Tin_no` varchar(50) DEFAULT NULL,
  `Status_id` int(11) DEFAULT NULL,
  `action_by` int(11) DEFAULT NULL,
  `Rejection_reason` text DEFAULT NULL,
  `Registered_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `client`
--

INSERT INTO `client` (`Client_ID`, `User_id`, `First_name`, `Middle_name`, `Last_name`, `Email`, `Profile_Image`, `Phone`, `Date_of_Birth`, `civil_status_type_ID`, `Province`, `Municipality`, `Postal_code`, `Barangay`, `Street_address`, `Tin_no`, `Status_id`, `action_by`, `Rejection_reason`, `Registered_at`) VALUES
(10, 23, 'Michael', 'I.', 'Nacaya', 'nacaya.michael123@gmail.com', NULL, '09354786152', '2026-03-20', 1, 'Agusan Del Norte', 'Butuan City (Capital)', '8600', 'Agao Pob. (Bgy. 3)', 'Zone 1', '12342', 1, 1, NULL, '2026-03-20 13:25:12'),
(11, 24, 'Francis', 'G.', 'Alaba', 'michaelnacaya86@gmail.com', NULL, '0954343245', '2026-03-20', 1, 'Misamis Oriental', 'Cagayan De Oro City (Capital)', '9000', 'Bonbon', 'zone 1', '12334', 1, 1, NULL, '2026-03-20 14:22:53');

-- --------------------------------------------------------

--
-- Table structure for table `client_services`
--

CREATE TABLE `client_services` (
  `Client_services_ID` int(11) NOT NULL,
  `Client_ID` int(11) DEFAULT NULL,
  `Services_type_Id` int(11) DEFAULT NULL,
  `Name` varchar(150) NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `User_ID` int(11) DEFAULT NULL,
  `Steps` varchar(255) DEFAULT NULL,
  `Date` date DEFAULT NULL,
  `Status_ID` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `consultation`
--

CREATE TABLE `consultation` (
  `Scheduling_ID` int(11) NOT NULL,
  `Description` text DEFAULT NULL,
  `Status_ID` int(11) DEFAULT NULL,
  `Client_services_ID` int(11) DEFAULT NULL,
  `Client_ID` int(11) NOT NULL,
  `action_by` int(11) DEFAULT NULL,
  `Date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `documents`
--

CREATE TABLE `documents` (
  `Documents_ID` int(11) NOT NULL,
  `appointment_id` int(11) DEFAULT NULL,
  `Client_ID` int(11) DEFAULT NULL,
  `Document_type_ID` int(11) DEFAULT NULL,
  `filename` varchar(255) DEFAULT NULL,
  `filepath` varchar(255) DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `documents`
--

INSERT INTO `documents` (`Documents_ID`, `appointment_id`, `Client_ID`, `Document_type_ID`, `filename`, `filepath`, `uploaded_at`) VALUES
(12, NULL, 10, 1, 'PSA Birth Certificate.png', 'uploads/client_files/client_10_doc_1_759e16efe2673fb7_PSA_Birth_Certificate.png', '2026-03-20 13:25:13'),
(13, NULL, 10, 2, 'PSA Birth Certificate.png', 'uploads/client_files/client_10_doc_2_c2b3a9b936fbb0ff_PSA_Birth_Certificate.png', '2026-03-20 13:25:13'),
(14, NULL, 11, 1, 'ezgif-frame-022.png', 'uploads/client_files/client_11_doc_1_a7bf995b2a09968f_ezgif-frame-022.png', '2026-03-20 14:22:53'),
(15, NULL, 11, 2, 'ezgif-frame-022.png', 'uploads/client_files/client_11_doc_2_0595ab585a6bb0a1_ezgif-frame-022.png', '2026-03-20 14:22:53'),
(16, NULL, 11, 4, 'ezgif-frame-023.png', 'uploads/client_files/client_11_doc_4_c8ad7a842d622883_ezgif-frame-023.png', '2026-03-20 14:22:53');

-- --------------------------------------------------------

--
-- Table structure for table `document_type`
--

CREATE TABLE `document_type` (
  `Document_type_ID` int(11) NOT NULL,
  `Document_name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `document_type`
--

INSERT INTO `document_type` (`Document_type_ID`, `Document_name`) VALUES
(1, 'valid_id'),
(2, 'birth_certificate'),
(3, 'marriage_contract'),
(4, 'business_permit');

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `Message_ID` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) NOT NULL,
  `message_text` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `notifications_ID` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `sender_id` int(11) DEFAULT NULL,
  `type` varchar(50) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`notifications_ID`, `user_id`, `sender_id`, `type`, `message`, `is_read`, `created_at`) VALUES
(8, 1, NULL, 'client_signup', 'New Client Registration\nMichael I. Nacaya has submitted a registration request. Please review and approve or reject the application.', 0, '2026-03-20 13:25:13'),
(9, 1, NULL, 'client_signup', 'New Client Registration\nFrancis G. Alaba has submitted a registration request. Please review and approve or reject the application.', 0, '2026-03-20 14:22:53');

-- --------------------------------------------------------

--
-- Table structure for table `role`
--

CREATE TABLE `role` (
  `Role_id` int(11) NOT NULL,
  `Role_name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `role`
--

INSERT INTO `role` (`Role_id`, `Role_name`) VALUES
(1, 'Admin'),
(2, 'Secretary'),
(3, 'Accountant'),
(4, 'Client');

-- --------------------------------------------------------

--
-- Table structure for table `services_type`
--

CREATE TABLE `services_type` (
  `Services_type_Id` int(11) NOT NULL,
  `Name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `services_type`
--

INSERT INTO `services_type` (`Services_type_Id`, `Name`) VALUES
(1, 'Tax Filing'),
(2, 'Auditing'),
(3, 'Book Keeping'),
(4, 'Consultation'),
(5, 'Processing');

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `Settings_ID` int(11) NOT NULL,
  `setting_key` varchar(100) DEFAULT NULL,
  `setting_value` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `settings`
--

INSERT INTO `settings` (`Settings_ID`, `setting_key`, `setting_value`) VALUES
(1, 'max_password_length', '64'),
(2, 'password_expiry_days', '90'),
(3, 'session_timeout_minutes', '30'),
(4, 'lockout_attempts', '5'),
(5, 'lockout_duration_minutes', '15'),
(771, 'system_company_name', 'Guibone Accounting Services (GAS)'),
(772, 'app_base_url', 'http://localhost:3000'),
(773, 'send_client_status_emails', '1'),
(774, 'smtp_host', 'smtp.gmail.com'),
(775, 'smtp_port', '587'),
(776, 'smtp_username', 'nacaya.michael123@gmail.com'),
(777, 'smtp_password', 'tjqt pfnr xnyj mmmv');

-- --------------------------------------------------------

--
-- Table structure for table `specialization_type`
--

CREATE TABLE `specialization_type` (
  `specialization_type_ID` int(11) NOT NULL,
  `Name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `specialization_type`
--

INSERT INTO `specialization_type` (`specialization_type_ID`, `Name`) VALUES
(1, 'Tax Filing'),
(2, 'Auditing'),
(3, 'Book Keeping'),
(4, 'Accounting Operations');

-- --------------------------------------------------------

--
-- Table structure for table `status`
--

CREATE TABLE `status` (
  `Status_id` int(11) NOT NULL,
  `Status_group` varchar(100) NOT NULL,
  `Status_name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `status`
--

INSERT INTO `status` (`Status_id`, `Status_group`, `Status_name`) VALUES
(1, 'CLIENT', 'Active'),
(2, 'CLIENT', 'Inactive'),
(3, 'EMPLOYMENT', 'Active'),
(4, 'EMPLOYMENT', 'Inactive'),
(5, 'EMPLOYMENT', 'Resigned'),
(6, 'APPOINTMENT', 'Pending'),
(7, 'APPOINTMENT', 'Approved'),
(8, 'APPOINTMENT', 'Reject'),
(10, 'TASK', 'Not Started'),
(11, 'TASK', 'In Progress'),
(12, 'TASK', 'Completed'),
(13, 'TASK', 'Cancelled'),
(14, 'CONSULTATION', 'Approved'),
(15, 'CONSULTATION', 'Pending'),
(16, 'CONSULTATION', 'Reject'),
(17, 'BUSINESS', 'Pending'),
(18, 'BUSINESS', 'Registered'),
(19, 'BUSINESS', 'Unregistered');

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

CREATE TABLE `user` (
  `User_id` int(11) NOT NULL,
  `Username` varchar(100) NOT NULL,
  `Password` varchar(64) NOT NULL,
  `Password_changed_at` datetime DEFAULT current_timestamp(),
  `Failed_login_attempts` int(11) NOT NULL DEFAULT 0,
  `Locked_until` datetime DEFAULT NULL,
  `Role_id` int(11) DEFAULT NULL,
  `Email` varchar(150) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `Profile_Image` varchar(255) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `specialization_type_ID` int(11) DEFAULT NULL,
  `sss_account_number` varchar(100) DEFAULT NULL,
  `pagibig_account_number` varchar(100) DEFAULT NULL,
  `philhealth_account_number` varchar(100) DEFAULT NULL,
  `Created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`User_id`, `Username`, `Password`, `Password_changed_at`, `Failed_login_attempts`, `Locked_until`, `Role_id`, `Email`, `first_name`, `middle_name`, `last_name`, `Profile_Image`, `date_of_birth`, `phone_number`, `specialization_type_ID`, `sss_account_number`, `pagibig_account_number`, `philhealth_account_number`, `Created_at`, `updated_at`) VALUES
(1, 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', '2026-02-14 01:18:12', 0, NULL, 1, 'admin@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-02-14 01:18:12', '2026-02-14 01:18:12'),
(21, 'dong', 'd8c9cf11fad21a9b4ad008bec3d28f23af9eac11ad6fc772a72e9da2b0fbb311', '2026-03-20 21:23:17', 0, NULL, 2, 'dong@gmail.com', 'Domingo', 'E.', 'Ancog', NULL, '2026-03-20', '4234324', 4, '313213', '21212', NULL, '2026-03-20 13:23:17', '2026-03-20 13:23:17'),
(22, 'roberth', '288691455f75bbd92deae0ab9c4453906b8d13eef7e66764ac9accbabed4f2bf', '2026-03-20 21:23:52', 0, NULL, 3, 'roberth@gmail.com', 'Roberth', NULL, 'Namoc', NULL, '2026-03-20', '4234324', 3, '313213', '21212', NULL, '2026-03-20 13:23:52', '2026-03-20 13:23:52'),
(23, 'nacaya.michael123@gmail.com', 'd8c9cf11fad21a9b4ad008bec3d28f23af9eac11ad6fc772a72e9da2b0fbb311', '2026-03-20 21:25:13', 0, NULL, 4, 'nacaya.michael123@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 13:25:13', '2026-03-20 13:25:13'),
(24, 'michaelnacaya86@gmail.com', '288691455f75bbd92deae0ab9c4453906b8d13eef7e66764ac9accbabed4f2bf', '2026-03-20 22:22:53', 0, NULL, 4, 'michaelnacaya86@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 14:22:53', '2026-03-20 14:22:53');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `announcements`
--
ALTER TABLE `announcements`
  ADD PRIMARY KEY (`announcement_ID`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `appointment`
--
ALTER TABLE `appointment`
  ADD PRIMARY KEY (`Appointment_ID`),
  ADD KEY `Client_ID` (`Client_ID`),
  ADD KEY `Services_type_Id` (`Services_type_Id`),
  ADD KEY `Status_ID` (`Status_ID`),
  ADD KEY `action_by` (`action_by`);

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`audit_logs_ID`);

--
-- Indexes for table `business`
--
ALTER TABLE `business`
  ADD PRIMARY KEY (`Business_id`),
  ADD KEY `Client_ID` (`Client_ID`),
  ADD KEY `Business_type_ID` (`Business_type_ID`),
  ADD KEY `Status_id` (`Status_id`);

--
-- Indexes for table `business_type`
--
ALTER TABLE `business_type`
  ADD PRIMARY KEY (`Business_type_ID`);

--
-- Indexes for table `civil_status_type`
--
ALTER TABLE `civil_status_type`
  ADD PRIMARY KEY (`civil_status_type_ID`);

--
-- Indexes for table `client`
--
ALTER TABLE `client`
  ADD PRIMARY KEY (`Client_ID`),
  ADD KEY `civil_status_type_ID` (`civil_status_type_ID`),
  ADD KEY `Status_id` (`Status_id`),
  ADD KEY `User_id` (`User_id`),
  ADD KEY `action_by` (`action_by`);

--
-- Indexes for table `client_services`
--
ALTER TABLE `client_services`
  ADD PRIMARY KEY (`Client_services_ID`),
  ADD KEY `Client_ID` (`Client_ID`),
  ADD KEY `Services_type_Id` (`Services_type_Id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `User_ID` (`User_ID`),
  ADD KEY `Status_ID` (`Status_ID`);

--
-- Indexes for table `consultation`
--
ALTER TABLE `consultation`
  ADD PRIMARY KEY (`Scheduling_ID`),
  ADD KEY `Status_ID` (`Status_ID`),
  ADD KEY `Client_services_ID` (`Client_services_ID`),
  ADD KEY `Client_ID` (`Client_ID`),
  ADD KEY `action_by` (`action_by`);

--
-- Indexes for table `documents`
--
ALTER TABLE `documents`
  ADD PRIMARY KEY (`Documents_ID`),
  ADD KEY `appointment_id` (`appointment_id`),
  ADD KEY `Client_ID` (`Client_ID`),
  ADD KEY `Document_type_ID` (`Document_type_ID`);

--
-- Indexes for table `document_type`
--
ALTER TABLE `document_type`
  ADD PRIMARY KEY (`Document_type_ID`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`Message_ID`),
  ADD KEY `sender_id` (`sender_id`),
  ADD KEY `receiver_id` (`receiver_id`),
  ADD KEY `idx_messages_sender_id` (`sender_id`),
  ADD KEY `idx_messages_receiver_id` (`receiver_id`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`notifications_ID`),
  ADD KEY `idx_notifications_user_id` (`user_id`),
  ADD KEY `idx_notifications_sender_id` (`sender_id`);

--
-- Indexes for table `role`
--
ALTER TABLE `role`
  ADD PRIMARY KEY (`Role_id`);

--
-- Indexes for table `services_type`
--
ALTER TABLE `services_type`
  ADD PRIMARY KEY (`Services_type_Id`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`Settings_ID`),
  ADD UNIQUE KEY `setting_key` (`setting_key`);

--
-- Indexes for table `specialization_type`
--
ALTER TABLE `specialization_type`
  ADD PRIMARY KEY (`specialization_type_ID`);

--
-- Indexes for table `status`
--
ALTER TABLE `status`
  ADD PRIMARY KEY (`Status_id`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`User_id`),
  ADD KEY `Role_id` (`Role_id`),
  ADD KEY `specialization_type_ID` (`specialization_type_ID`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `announcements`
--
ALTER TABLE `announcements`
  MODIFY `announcement_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `appointment`
--
ALTER TABLE `appointment`
  MODIFY `Appointment_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `audit_logs_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `business`
--
ALTER TABLE `business`
  MODIFY `Business_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `business_type`
--
ALTER TABLE `business_type`
  MODIFY `Business_type_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `civil_status_type`
--
ALTER TABLE `civil_status_type`
  MODIFY `civil_status_type_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `client`
--
ALTER TABLE `client`
  MODIFY `Client_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `client_services`
--
ALTER TABLE `client_services`
  MODIFY `Client_services_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `consultation`
--
ALTER TABLE `consultation`
  MODIFY `Scheduling_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `documents`
--
ALTER TABLE `documents`
  MODIFY `Documents_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `document_type`
--
ALTER TABLE `document_type`
  MODIFY `Document_type_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `Message_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `notifications_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `role`
--
ALTER TABLE `role`
  MODIFY `Role_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `services_type`
--
ALTER TABLE `services_type`
  MODIFY `Services_type_Id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `Settings_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=847;

--
-- AUTO_INCREMENT for table `specialization_type`
--
ALTER TABLE `specialization_type`
  MODIFY `specialization_type_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `status`
--
ALTER TABLE `status`
  MODIFY `Status_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=31;

--
-- AUTO_INCREMENT for table `user`
--
ALTER TABLE `user`
  MODIFY `User_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `announcements`
--
ALTER TABLE `announcements`
  ADD CONSTRAINT `announcements_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `appointment`
--
ALTER TABLE `appointment`
  ADD CONSTRAINT `appointment_ibfk_1` FOREIGN KEY (`Client_ID`) REFERENCES `client` (`Client_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `appointment_ibfk_2` FOREIGN KEY (`Services_type_Id`) REFERENCES `services_type` (`Services_type_Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `appointment_ibfk_3` FOREIGN KEY (`Status_ID`) REFERENCES `status` (`Status_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `appointment_ibfk_4` FOREIGN KEY (`action_by`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `business`
--
ALTER TABLE `business`
  ADD CONSTRAINT `business_ibfk_1` FOREIGN KEY (`Client_ID`) REFERENCES `client` (`Client_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `business_ibfk_2` FOREIGN KEY (`Business_type_ID`) REFERENCES `business_type` (`Business_type_ID`) ON UPDATE CASCADE,
  ADD CONSTRAINT `business_ibfk_3` FOREIGN KEY (`Status_id`) REFERENCES `status` (`Status_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `client`
--
ALTER TABLE `client`
  ADD CONSTRAINT `client_ibfk_1` FOREIGN KEY (`Status_id`) REFERENCES `status` (`Status_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `client_ibfk_2` FOREIGN KEY (`civil_status_type_ID`) REFERENCES `civil_status_type` (`civil_status_type_ID`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `client_ibfk_3` FOREIGN KEY (`User_id`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `client_ibfk_4` FOREIGN KEY (`action_by`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `client_services`
--
ALTER TABLE `client_services`
  ADD CONSTRAINT `client_services_ibfk_1` FOREIGN KEY (`Client_ID`) REFERENCES `client` (`Client_ID`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `client_services_ibfk_2` FOREIGN KEY (`Services_type_Id`) REFERENCES `services_type` (`Services_type_Id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `client_services_ibfk_3` FOREIGN KEY (`User_ID`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `client_services_ibfk_4` FOREIGN KEY (`Status_ID`) REFERENCES `status` (`Status_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `client_services_ibfk_5` FOREIGN KEY (`created_by`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `consultation`
--
ALTER TABLE `consultation`
  ADD CONSTRAINT `consultation_ibfk_1` FOREIGN KEY (`Status_ID`) REFERENCES `status` (`Status_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `consultation_ibfk_2` FOREIGN KEY (`Client_services_ID`) REFERENCES `client_services` (`Client_services_ID`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `consultation_ibfk_3` FOREIGN KEY (`Client_ID`) REFERENCES `client` (`Client_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `consultation_ibfk_4` FOREIGN KEY (`action_by`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `documents`
--
ALTER TABLE `documents`
  ADD CONSTRAINT `documents_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointment` (`Appointment_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `documents_ibfk_2` FOREIGN KEY (`Document_type_ID`) REFERENCES `document_type` (`Document_type_ID`) ON UPDATE CASCADE,
  ADD CONSTRAINT `documents_ibfk_3` FOREIGN KEY (`Client_ID`) REFERENCES `client` (`Client_ID`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `fk_messages_receiver_user` FOREIGN KEY (`receiver_id`) REFERENCES `user` (`User_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_messages_sender_user` FOREIGN KEY (`sender_id`) REFERENCES `user` (`User_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`receiver_id`) REFERENCES `user` (`User_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `user` (`User_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`User_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `user`
--
ALTER TABLE `user`
  ADD CONSTRAINT `user_ibfk_1` FOREIGN KEY (`Role_id`) REFERENCES `role` (`Role_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `user_ibfk_3` FOREIGN KEY (`specialization_type_ID`) REFERENCES `specialization_type` (`specialization_type_ID`) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
