-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 25, 2026 at 12:50 AM
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
(82, 1, 'Login successful', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 21:50:14'),
(83, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 21:59:35'),
(84, 21, 'Login successful', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:01:31'),
(85, 21, 'Logged out', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:01:37'),
(86, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:02:17'),
(87, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:04:32'),
(88, 21, 'Failed login attempt', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:04:47'),
(89, 1, 'Security settings updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:04:56'),
(90, 1, 'Login successful', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:05:09'),
(91, 1, 'Logged out', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:05:16'),
(92, 21, 'Login successful', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:05:23'),
(93, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:08:10'),
(94, 22, 'Login successful', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:09:34'),
(95, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:10:25'),
(96, 22, 'Logged out', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:10:32'),
(97, 24, 'Login successful', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:10:49'),
(98, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:11:02'),
(99, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:12:16'),
(100, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:20:44'),
(101, 1, 'Module permissions updated', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:20:54'),
(102, 21, 'Logged out', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:46:53'),
(103, 24, 'Logged out', '202.61.110.220', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 22:54:53'),
(104, 1, 'Login successful', '202.61.110.212', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-20 00:21:22'),
(105, 1, 'Logged out', '202.61.110.212', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-20 00:21:36'),
(106, 24, 'Login successful', '202.61.110.212', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-20 00:21:52'),
(107, 21, 'Failed login attempt', '202.61.110.212', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-20 00:51:28'),
(108, 21, 'Login successful', '202.61.110.212', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-20 00:51:31'),
(109, 24, 'Logged out', '202.61.110.212', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-20 00:51:53'),
(110, 22, 'Failed login attempt', '202.61.110.213', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-20 00:52:02'),
(111, 22, 'Login successful', '202.61.110.213', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-20 00:52:06'),
(112, 1, 'Login successful', '2001:fd8:c7b9:6400:3532:4d94:4752:ceda', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-24 22:47:44');

-- --------------------------------------------------------

--
-- Table structure for table `bundle_tasks`
--

CREATE TABLE `bundle_tasks` (
  `Bundle_Tasks_ID` int(11) NOT NULL,
  `Services_type_Id` int(11) NOT NULL,
  `Step_Number` int(11) NOT NULL,
  `Assignee` varchar(50) NOT NULL,
  `Step_Text` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `bundle_tasks`
--

INSERT INTO `bundle_tasks` (`Bundle_Tasks_ID`, `Services_type_Id`, `Step_Number`, `Assignee`, `Step_Text`) VALUES
(1, 1, 1, 'secretary', 'Collect and validate the client\'s tax source documents for the filing period.'),
(2, 1, 2, 'accountant', 'Review records and reconcile transactions that affect the tax filing.'),
(3, 1, 3, 'accountant', 'Prepare the tax return and compute the amount due or refund.'),
(4, 1, 4, 'owner', 'Review the prepared return and approve it before submission.'),
(5, 1, 5, 'secretary', 'Submit the filing and save the official proof of submission.'),
(6, 2, 1, 'secretary', 'Request the audit requirements and prior records from the client.'),
(7, 2, 2, 'accountant', 'Organize the working papers and supporting schedules.'),
(8, 2, 3, 'accountant', 'Perform audit testing and document the findings.'),
(9, 2, 4, 'owner', 'Review the findings and approve the final audit report.'),
(10, 2, 5, 'secretary', 'Release the completed audit report to the client.'),
(11, 3, 1, 'secretary', 'Collect bookkeeping documents, receipts, and supporting files from the client.'),
(12, 3, 2, 'accountant', 'Record and categorize the transactions for the covered period.'),
(13, 3, 3, 'accountant', 'Reconcile the bank records and subsidiary ledgers.'),
(14, 3, 4, 'accountant', 'Prepare the bookkeeping summary and draft reports.'),
(15, 3, 5, 'owner', 'Review the reports and confirm the bookkeeping output.'),
(16, 5, 1, 'secretary', 'Confirm the client\'s requirements and identify missing documents.'),
(17, 5, 2, 'secretary', 'Prepare the processing checklist and required forms.'),
(18, 5, 3, 'accountant', 'Review the submitted details and attachments for completeness.'),
(19, 5, 4, 'secretary', 'Submit the processed documents and track the status update.');

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
(12, 11, 'O.G Old Gamer', 2, 18, 'Misamis Oriental', 'Cagayan De Oro City (Capital)', '9000', 'Bonbon', 'zone 1', 'domingo.ancog42@gmail.com', '123', '09354786152', '2026-03-20 14:22:53'),
(13, 12, 'Northstar Retail Hub', 1, 18, 'Metro Manila', 'Quezon City', '1105', 'Batasan Hills', 'Lot 12, Phase 3', 'elaine.santos@example.com', '120000001201', '09170000001', '2026-03-21 08:15:00'),
(14, 13, 'Castro Logistics Services', 2, 18, 'Cebu', 'Cebu City', '6000', 'Lahug', 'Unit 4, Logistics Park', 'jose.castro@example.com', '120000001202', '09170000002', '2026-03-21 08:30:00'),
(15, 14, 'Reyes Food Corner', 1, 18, 'Davao del Sur', 'Davao City', '8000', 'Buhangin', 'Door 5, Market Lane', 'maria.reyes@example.com', '120000001203', '09170000003', '2026-03-21 08:45:00'),
(16, 15, 'PDC Digital Solutions', 3, 18, 'Iloilo', 'Iloilo City', '5000', 'Mandurriao', '3rd Floor, Tech Arcade', 'paolo.delacruz@example.com', '120000001204', '09170000004', '2026-03-21 09:00:00'),
(17, 16, 'Flores Wellness Studio', 1, 18, 'Cavite', 'Bacoor', '4102', 'Molino III', 'Blk 8 Lot 4', 'andrea.flores@example.com', '120000001205', '09170000005', '2026-03-22 09:15:00'),
(18, 17, 'Ramos Hardware Trading', 2, 18, 'Laguna', 'Calamba City', '4027', 'Palo Alto', 'Warehouse 2, National Road', 'miguel.ramos@example.com', '120000001206', '09170000006', '2026-03-22 09:30:00'),
(19, 18, 'Mendoza Creative Prints', 1, 18, 'Bulacan', 'Malolos City', '3000', 'Santo Rosario', 'Print Hub Building', 'sofia.mendoza@example.com', '120000001207', '09170000007', '2026-03-22 09:45:00'),
(20, 19, 'Garcia Agri Supply', 3, 18, 'Pangasinan', 'Urdaneta City', '2428', 'Nancalobasaan', 'Zone 2, Highway Frontage', 'daniel.garcia@example.com', '120000001208', '09170000008', '2026-03-23 10:00:00'),
(21, 20, 'Torres Home Essentials', 2, 18, 'Rizal', 'Antipolo City', '1870', 'San Isidro', 'Sitio Centro, Block 6', 'camille.torres@example.com', '120000001209', '09170000009', '2026-03-23 10:15:00'),
(22, 21, 'Navarro Auto Care', 1, 18, 'Pampanga', 'San Fernando City', '2000', 'Sindalan', 'MacArthur Highway', 'adrian.navarro@example.com', '120000001210', '09170000010', '2026-03-23 10:30:00');

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
-- Table structure for table `certificates`
--

CREATE TABLE `certificates` (
  `certificates_ID` int(11) NOT NULL,
  `certificate_id` varchar(50) NOT NULL,
  `Client_ID` int(11) NOT NULL,
  `Client_services_ID` int(11) DEFAULT NULL,
  `Services_type_Id` int(11) DEFAULT NULL,
  `Edit_certificate_ID` int(11) DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `issue_date` date NOT NULL,
  `issued_by` varchar(150) DEFAULT NULL,
  `company_name` varchar(150) DEFAULT 'Guibone Accounting Services',
  `template_snapshot` longtext DEFAULT NULL,
  `certificate_html` longtext DEFAULT NULL,
  `recipient_email` varchar(150) DEFAULT NULL,
  `delivery_status` varchar(50) NOT NULL DEFAULT 'pending',
  `delivery_message` text DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
(11, 24, 'Francis', 'G.', 'Alaba', 'michaelnacaya86@gmail.com', NULL, '0954343245', '2026-03-20', 1, 'Misamis Oriental', 'Cagayan De Oro City (Capital)', '9000', 'Bonbon', 'zone 1', '12334', 1, 1, NULL, '2026-03-20 14:22:53'),
(12, 25, 'Elaine', 'M.', 'Santos', 'elaine.santos@example.com', NULL, '09170000001', '1994-05-12', 1, 'Metro Manila', 'Quezon City', '1105', 'Batasan Hills', 'Lot 12, Phase 3', '120000001201', 1, 1, NULL, '2026-03-21 08:10:00'),
(13, 26, 'Jose', 'P.', 'Castro', 'jose.castro@example.com', NULL, '09170000002', '1990-09-21', 2, 'Cebu', 'Cebu City', '6000', 'Lahug', 'Unit 4, Logistics Park', '120000001202', 1, 1, NULL, '2026-03-21 08:25:00'),
(14, 27, 'Maria', 'L.', 'Reyes', 'maria.reyes@example.com', NULL, '09170000003', '1996-02-14', 1, 'Davao del Sur', 'Davao City', '8000', 'Buhangin', 'Door 5, Market Lane', '120000001203', 1, 1, NULL, '2026-03-21 08:40:00'),
(15, 28, 'Paolo', 'D.', 'Dela Cruz', 'paolo.delacruz@example.com', NULL, '09170000004', '1989-11-30', 2, 'Iloilo', 'Iloilo City', '5000', 'Mandurriao', '3rd Floor, Tech Arcade', '120000001204', 1, 1, NULL, '2026-03-21 08:55:00'),
(16, 29, 'Andrea', 'S.', 'Flores', 'andrea.flores@example.com', NULL, '09170000005', '1993-07-08', 1, 'Cavite', 'Bacoor', '4102', 'Molino III', 'Blk 8 Lot 4', '120000001205', 1, 1, NULL, '2026-03-22 09:10:00'),
(17, 30, 'Miguel', 'A.', 'Ramos', 'miguel.ramos@example.com', NULL, '09170000006', '1988-03-17', 2, 'Laguna', 'Calamba City', '4027', 'Palo Alto', 'Warehouse 2, National Road', '120000001206', 1, 1, NULL, '2026-03-22 09:25:00'),
(18, 31, 'Sofia', 'C.', 'Mendoza', 'sofia.mendoza@example.com', NULL, '09170000007', '1995-12-03', 1, 'Bulacan', 'Malolos City', '3000', 'Santo Rosario', 'Print Hub Building', '120000001207', 1, 1, NULL, '2026-03-22 09:40:00'),
(19, 32, 'Daniel', 'T.', 'Garcia', 'daniel.garcia@example.com', NULL, '09170000008', '1991-06-26', 2, 'Pangasinan', 'Urdaneta City', '2428', 'Nancalobasaan', 'Zone 2, Highway Frontage', '120000001208', 1, 1, NULL, '2026-03-23 09:55:00'),
(20, 33, 'Camille', 'R.', 'Torres', 'camille.torres@example.com', NULL, '09170000009', '1997-01-19', 1, 'Rizal', 'Antipolo City', '1870', 'San Isidro', 'Sitio Centro, Block 6', '120000001209', 1, 1, NULL, '2026-03-23 10:10:00'),
(21, 34, 'Adrian', 'V.', 'Navarro', 'adrian.navarro@example.com', NULL, '09170000010', '1987-10-11', 2, 'Pampanga', 'San Fernando City', '2000', 'Sindalan', 'MacArthur Highway', '120000001210', 1, 1, NULL, '2026-03-23 10:25:00');

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
  `Steps` text DEFAULT NULL,
  `Date` date DEFAULT NULL,
  `Status_ID` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `consultation`
--

CREATE TABLE `consultation` (
  `Consultation_ID` int(11) NOT NULL,
  `Description` text DEFAULT NULL,
  `Status_ID` int(11) DEFAULT NULL,
  `Services_type_Id` int(11) DEFAULT NULL,
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
  `Status_id` int(11) DEFAULT NULL,
  `filename` varchar(255) DEFAULT NULL,
  `filepath` varchar(255) DEFAULT NULL,
  `duration_days` int(11) DEFAULT NULL,
  `expiration_date` date DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `documents`
--

INSERT INTO `documents` (`Documents_ID`, `appointment_id`, `Client_ID`, `Document_type_ID`, `Status_id`, `filename`, `filepath`, `duration_days`, `expiration_date`, `uploaded_at`) VALUES
(12, NULL, 10, 1, NULL, 'PSA Birth Certificate.png', 'uploads/client_files/client_10_doc_1_759e16efe2673fb7_PSA_Birth_Certificate.png', NULL, NULL, '2026-03-20 13:25:13'),
(13, NULL, 10, 2, NULL, 'PSA Birth Certificate.png', 'uploads/client_files/client_10_doc_2_c2b3a9b936fbb0ff_PSA_Birth_Certificate.png', NULL, NULL, '2026-03-20 13:25:13'),
(14, NULL, 11, 1, NULL, 'ezgif-frame-022.png', 'uploads/client_files/client_11_doc_1_a7bf995b2a09968f_ezgif-frame-022.png', NULL, NULL, '2026-03-20 14:22:53'),
(15, NULL, 11, 2, NULL, 'ezgif-frame-022.png', 'uploads/client_files/client_11_doc_2_0595ab585a6bb0a1_ezgif-frame-022.png', NULL, NULL, '2026-03-20 14:22:53'),
(16, NULL, 11, 4, NULL, 'ezgif-frame-023.png', 'uploads/client_files/client_11_doc_4_c8ad7a842d622883_ezgif-frame-023.png', NULL, NULL, '2026-03-20 14:22:53');

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
(4, 'business_permit'),
(5, 'dti'),
(6, 'sec'),
(7, 'lgu');

-- --------------------------------------------------------

--
-- Table structure for table `edit_certificate`
--

CREATE TABLE `edit_certificate` (
  `Edit_certificate_ID` int(11) NOT NULL,
  `template_id` varchar(80) NOT NULL,
  `Services_type_Id` int(11) DEFAULT NULL,
  `service_key` varchar(50) DEFAULT NULL,
  `template_name` varchar(150) DEFAULT NULL,
  `page_size` varchar(20) NOT NULL DEFAULT 'A4',
  `font_family` varchar(50) NOT NULL DEFAULT 'arial',
  `theme_key` varchar(50) NOT NULL DEFAULT 'none',
  `logo_src` longtext DEFAULT NULL,
  `logo_block` longtext DEFAULT NULL,
  `content_block` longtext DEFAULT NULL,
  `text_blocks` longtext DEFAULT NULL,
  `signature_blocks` longtext DEFAULT NULL,
  `is_selected` tinyint(1) NOT NULL DEFAULT 0,
  `User_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
(34, 23, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(35, 24, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(36, 25, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(37, 26, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(38, 27, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(39, 28, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(40, 29, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(41, 30, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(42, 31, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(43, 32, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(44, 33, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(45, 34, 1, 'module_permission_revoked', 'Dashboard Access Removed: Admin admin removed your access to Dashboard.', 0, '2026-04-19 22:20:44'),
(46, 23, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(47, 24, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(48, 25, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(49, 26, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(50, 27, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(51, 28, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(52, 29, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(53, 30, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(54, 31, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(55, 32, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(56, 33, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54'),
(57, 34, 1, 'module_permission_granted', 'Dashboard Access Granted: Admin admin granted you access to Dashboard.', 0, '2026-04-19 22:20:54');

-- --------------------------------------------------------

--
-- Table structure for table `permissions`
--

CREATE TABLE `permissions` (
  `permission_id` int(11) NOT NULL,
  `module_key` varchar(100) NOT NULL,
  `action_key` varchar(100) NOT NULL DEFAULT '',
  `permission_name` varchar(191) NOT NULL,
  `User_ID` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `permissions`
--

INSERT INTO `permissions` (`permission_id`, `module_key`, `action_key`, `permission_name`, `User_ID`) VALUES
(58, 'dashboard', '', 'dashboard', 1),
(59, 'user-management', '', 'user-management', 1),
(60, 'user-management', 'view', 'user-management.view', 1),
(61, 'user-management', 'edit', 'user-management.edit', 1),
(62, 'user-management', 'add-user', 'user-management.add-user', 1),
(63, 'user-management', 'account-status', 'user-management.account-status', 1),
(64, 'permissions', '', 'permissions', 1),
(65, 'settings', '', 'settings', 1),
(66, 'client-management', '', 'client-management', 1),
(67, 'client-management', 'view', 'client-management.view', 1),
(68, 'client-management', 'edit', 'client-management.edit', 1),
(69, 'client-management', 'add-new-client', 'client-management.add-new-client', 1),
(70, 'client-management', 'location', 'client-management.location', 1),
(71, 'client-management', 'file-upload', 'client-management.file-upload', 1),
(72, 'client-management', 'account-status', 'client-management.account-status', 1),
(73, 'new-client-management', '', 'new-client-management', 1),
(74, 'documents', '', 'documents', 1),
(75, 'documents', 'upload', 'documents.upload', 1),
(76, 'documents', 'view-only', 'documents.view-only', 1),
(77, 'certificate', '', 'certificate', 1),
(78, 'certificate', 'edit', 'certificate.edit', 1),
(79, 'certificate', 'remove', 'certificate.remove', 1),
(80, 'certificate', 'remove-auto-send', 'certificate.remove-auto-send', 1),
(81, 'edit-certificate', '', 'edit-certificate', 1),
(82, 'edit-certificate', 'header-tools-properties', 'edit-certificate.header-tools-properties', 1),
(83, 'business-status', '', 'business-status', 1),
(84, 'appointments', '', 'appointments', 1),
(85, 'appointments', 'approve', 'appointments.approve', 1),
(86, 'appointments', 'decline', 'appointments.decline', 1),
(87, 'appointments', 'view-files', 'appointments.view-files', 1),
(88, 'scheduling', '', 'scheduling', 1),
(89, 'scheduling', 'approve', 'scheduling.approve', 1),
(90, 'scheduling', 'decline', 'scheduling.decline', 1),
(91, 'scheduling', 'reschedule', 'scheduling.reschedule', 1),
(92, 'scheduling', 'configure-times', 'scheduling.configure-times', 1),
(93, 'tasks', '', 'tasks', 1),
(94, 'tasks', 'create-task', 'tasks.create-task', 1),
(95, 'tasks', 'client-appointments', 'tasks.client-appointments', 1),
(96, 'tasks', 'task-limit', 'tasks.task-limit', 1),
(97, 'tasks', 'edit-step', 'tasks.edit-step', 1),
(98, 'tasks', 'remove-step', 'tasks.remove-step', 1),
(99, 'calendar', '', 'calendar', 1),
(100, 'work-update', '', 'work-update', 1),
(101, 'work-update', 'check-steps', 'work-update.check-steps', 1),
(102, 'work-update', 'approve', 'work-update.approve', 1),
(103, 'work-update', 'history', 'work-update.history', 1),
(104, 'work-update', 'edit', 'work-update.edit', 1),
(105, 'work-update', 'mark-done', 'work-update.mark-done', 1),
(106, 'work-update', 'decline', 'work-update.decline', 1),
(107, 'work-update', 'remarks', 'work-update.remarks', 1),
(108, 'work-update', 'archive', 'work-update.archive', 1),
(109, 'work-update', 'restore', 'work-update.restore', 1),
(110, 'messaging', '', 'messaging', 1),
(111, 'reports', '', 'reports', 1),
(112, 'client-account', '', 'client-account', 1);

-- --------------------------------------------------------

--
-- Table structure for table `role`
--

CREATE TABLE `role` (
  `Role_id` int(11) NOT NULL,
  `Role_name` varchar(100) NOT NULL,
  `Permission_page_status_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `role`
--

INSERT INTO `role` (`Role_id`, `Role_name`, `Permission_page_status_id`) VALUES
(1, 'Admin', 24),
(2, 'Secretary', 24),
(3, 'Accountant', 24),
(4, 'Client', 24);

-- --------------------------------------------------------

--
-- Table structure for table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `role_permissions_ID` int(11) NOT NULL,
  `Role_id` int(11) NOT NULL,
  `permission_id` int(11) NOT NULL,
  `is_allowed` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `role_permissions`
--

INSERT INTO `role_permissions` (`role_permissions_ID`, `Role_id`, `permission_id`, `is_allowed`) VALUES
(225, 1, 58, 1),
(226, 2, 58, 1),
(227, 3, 58, 1),
(228, 4, 58, 1),
(229, 1, 59, 1),
(230, 2, 59, 0),
(231, 3, 59, 0),
(232, 4, 59, 0),
(233, 1, 60, 1),
(234, 2, 60, 0),
(235, 3, 60, 0),
(236, 4, 60, 0),
(237, 1, 61, 1),
(238, 2, 61, 0),
(239, 3, 61, 0),
(240, 4, 61, 0),
(241, 1, 62, 1),
(242, 2, 62, 0),
(243, 3, 62, 0),
(244, 4, 62, 0),
(245, 1, 63, 1),
(246, 2, 63, 0),
(247, 3, 63, 0),
(248, 4, 63, 0),
(249, 1, 64, 1),
(250, 2, 64, 0),
(251, 3, 64, 0),
(252, 4, 64, 0),
(253, 1, 65, 1),
(254, 2, 65, 0),
(255, 3, 65, 0),
(256, 4, 65, 0),
(257, 1, 66, 1),
(258, 2, 66, 1),
(259, 3, 66, 0),
(260, 4, 66, 0),
(261, 1, 67, 1),
(262, 2, 67, 1),
(263, 3, 67, 0),
(264, 4, 67, 0),
(265, 1, 68, 1),
(266, 2, 68, 0),
(267, 3, 68, 0),
(268, 4, 68, 0),
(269, 1, 69, 1),
(270, 2, 69, 0),
(271, 3, 69, 0),
(272, 4, 69, 0),
(273, 1, 70, 1),
(274, 2, 70, 1),
(275, 3, 70, 0),
(276, 4, 70, 0),
(277, 1, 71, 1),
(278, 2, 71, 1),
(279, 3, 71, 0),
(280, 4, 71, 0),
(281, 1, 72, 1),
(282, 2, 72, 0),
(283, 3, 72, 0),
(284, 4, 72, 0),
(285, 1, 73, 1),
(286, 2, 73, 0),
(287, 3, 73, 0),
(288, 4, 73, 0),
(289, 1, 74, 1),
(290, 2, 74, 1),
(291, 3, 74, 0),
(292, 4, 74, 0),
(293, 1, 75, 1),
(294, 2, 75, 0),
(295, 3, 75, 0),
(296, 4, 75, 0),
(297, 1, 76, 1),
(298, 2, 76, 1),
(299, 3, 76, 0),
(300, 4, 76, 0),
(301, 1, 77, 1),
(302, 2, 77, 0),
(303, 3, 77, 0),
(304, 4, 77, 0),
(305, 1, 78, 1),
(306, 2, 78, 0),
(307, 3, 78, 0),
(308, 4, 78, 0),
(309, 1, 79, 1),
(310, 2, 79, 0),
(311, 3, 79, 0),
(312, 4, 79, 0),
(313, 1, 80, 1),
(314, 2, 80, 0),
(315, 3, 80, 0),
(316, 4, 80, 0),
(317, 1, 81, 1),
(318, 2, 81, 0),
(319, 3, 81, 0),
(320, 4, 81, 0),
(321, 1, 82, 1),
(322, 2, 82, 0),
(323, 3, 82, 0),
(324, 4, 82, 0),
(325, 1, 83, 1),
(326, 2, 83, 1),
(327, 3, 83, 0),
(328, 4, 83, 0),
(329, 1, 84, 1),
(330, 2, 84, 1),
(331, 3, 84, 0),
(332, 4, 84, 0),
(333, 1, 85, 1),
(334, 2, 85, 1),
(335, 3, 85, 0),
(336, 4, 85, 0),
(337, 1, 86, 1),
(338, 2, 86, 1),
(339, 3, 86, 0),
(340, 4, 86, 0),
(341, 1, 87, 1),
(342, 2, 87, 1),
(343, 3, 87, 0),
(344, 4, 87, 0),
(345, 1, 88, 1),
(346, 2, 88, 0),
(347, 3, 88, 0),
(348, 4, 88, 0),
(349, 1, 89, 1),
(350, 2, 89, 0),
(351, 3, 89, 0),
(352, 4, 89, 0),
(353, 1, 90, 1),
(354, 2, 90, 0),
(355, 3, 90, 0),
(356, 4, 90, 0),
(357, 1, 91, 1),
(358, 2, 91, 0),
(359, 3, 91, 0),
(360, 4, 91, 0),
(361, 1, 92, 1),
(362, 2, 92, 0),
(363, 3, 92, 0),
(364, 4, 92, 0),
(365, 1, 93, 1),
(366, 2, 93, 1),
(367, 3, 93, 0),
(368, 4, 93, 0),
(369, 1, 94, 1),
(370, 2, 94, 1),
(371, 3, 94, 0),
(372, 4, 94, 0),
(373, 1, 95, 1),
(374, 2, 95, 1),
(375, 3, 95, 0),
(376, 4, 95, 0),
(377, 1, 96, 1),
(378, 2, 96, 0),
(379, 3, 96, 0),
(380, 4, 96, 0),
(381, 1, 97, 1),
(382, 2, 97, 1),
(383, 3, 97, 0),
(384, 4, 97, 0),
(385, 1, 98, 1),
(386, 2, 98, 1),
(387, 3, 98, 0),
(388, 4, 98, 0),
(389, 1, 99, 1),
(390, 2, 99, 1),
(391, 3, 99, 1),
(392, 4, 99, 0),
(393, 1, 100, 1),
(394, 2, 100, 1),
(395, 3, 100, 1),
(396, 4, 100, 0),
(397, 1, 101, 1),
(398, 2, 101, 1),
(399, 3, 101, 1),
(400, 4, 101, 0),
(401, 1, 102, 1),
(402, 2, 102, 1),
(403, 3, 102, 0),
(404, 4, 102, 0),
(405, 1, 103, 1),
(406, 2, 103, 1),
(407, 3, 103, 1),
(408, 4, 103, 0),
(409, 1, 104, 1),
(410, 2, 104, 1),
(411, 3, 104, 1),
(412, 4, 104, 0),
(413, 1, 105, 1),
(414, 2, 105, 1),
(415, 3, 105, 0),
(416, 4, 105, 0),
(417, 1, 106, 1),
(418, 2, 106, 1),
(419, 3, 106, 1),
(420, 4, 106, 0),
(421, 1, 107, 1),
(422, 2, 107, 1),
(423, 3, 107, 1),
(424, 4, 107, 0),
(425, 1, 108, 1),
(426, 2, 108, 1),
(427, 3, 108, 1),
(428, 4, 108, 0),
(429, 1, 109, 1),
(430, 2, 109, 1),
(431, 3, 109, 1),
(432, 4, 109, 0),
(433, 1, 110, 1),
(434, 2, 110, 1),
(435, 3, 110, 1),
(436, 4, 110, 1),
(437, 1, 111, 1),
(438, 2, 111, 1),
(439, 3, 111, 0),
(440, 4, 111, 0),
(441, 1, 112, 1),
(442, 2, 112, 0),
(443, 3, 112, 0),
(444, 4, 112, 1);

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
(6, 'login_verification_enabled', '0'),
(771, 'system_company_name', 'Guibone Accounting Services (GAS)'),
(772, 'app_base_url', 'http://localhost:3000'),
(773, 'send_client_status_emails', '1'),
(774, 'smtp_host', 'smtp.gmail.com'),
(775, 'smtp_port', '587'),
(776, 'smtp_username', 'nacaya.michael123@gmail.com'),
(777, 'smtp_password', 'tjqt pfnr xnyj mmmv'),
(1051, 'allow_client_self_signup', '1'),
(1052, 'allow_client_appointments', '1'),
(1053, 'allow_client_consultations', '1'),
(1054, 'support_email', ''),
(1055, 'system_notice', ''),
(1130, 'task_reminder_interval_hours', '4'),
(1131, 'task_reminder_interval_minutes', '0'),
(2779, 'user_specialization_assignments', '{\"users\":{\"35\":[4],\"36\":[2]}}');

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
(1, 'Tax Filing Operations'),
(2, 'Auditing Operations'),
(3, 'Book Keeping Operations'),
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
(19, 'BUSINESS', 'Unregistered'),
(20, 'TASK', 'Incomplete'),
(21, 'TASK', 'Overdue'),
(22, 'DOCUMENTS', 'Renewed'),
(23, 'DOCUMENTS', 'Expired'),
(24, 'PERMISSION_PAGE', 'Unlocked'),
(25, 'PERMISSION_PAGE', 'Locked');

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
  `Employment_status_id` int(11) DEFAULT NULL,
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

INSERT INTO `user` (`User_id`, `Username`, `Password`, `Password_changed_at`, `Failed_login_attempts`, `Locked_until`, `Role_id`, `Employment_status_id`, `Email`, `first_name`, `middle_name`, `last_name`, `Profile_Image`, `date_of_birth`, `phone_number`, `specialization_type_ID`, `sss_account_number`, `pagibig_account_number`, `philhealth_account_number`, `Created_at`, `updated_at`) VALUES
(1, 'admin', '$2y$10$sPF40Xh86GN9Ic6XJlYeGeXxzxQclnonkd9Wl.V3IxhIKZH7vJW36', '2026-02-14 01:18:12', 0, NULL, 1, 3, 'admin@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-02-14 01:18:12', '2026-04-19 21:50:14'),
(23, 'nacaya.michael123@gmail.com', 'd8c9cf11fad21a9b4ad008bec3d28f23af9eac11ad6fc772a72e9da2b0fbb311', '2026-03-20 21:25:13', 0, NULL, 4, NULL, 'nacaya.michael123@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 13:25:13', '2026-03-20 13:25:13'),
(24, 'michaelnacaya86@gmail.com', '$2y$10$fRq2oDys7T/vTqkmtP260.Qs.4KOVEMvgGkVqJ/VBgf.EHkO013za', '2026-03-20 22:22:53', 0, NULL, 4, NULL, 'michaelnacaya86@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 14:22:53', '2026-04-19 22:10:49'),
(25, 'elaine.santos@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-21 08:10:00', 0, NULL, 4, NULL, 'elaine.santos@example.com', 'Elaine', 'M.', 'Santos', NULL, '1994-05-12', '09170000001', NULL, NULL, NULL, NULL, '2026-03-21 08:10:00', '2026-03-21 08:10:00'),
(26, 'jose.castro@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-21 08:25:00', 0, NULL, 4, NULL, 'jose.castro@example.com', 'Jose', 'P.', 'Castro', NULL, '1990-09-21', '09170000002', NULL, NULL, NULL, NULL, '2026-03-21 08:25:00', '2026-03-21 08:25:00'),
(27, 'maria.reyes@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-21 08:40:00', 0, NULL, 4, NULL, 'maria.reyes@example.com', 'Maria', 'L.', 'Reyes', NULL, '1996-02-14', '09170000003', NULL, NULL, NULL, NULL, '2026-03-21 08:40:00', '2026-03-21 08:40:00'),
(28, 'paolo.delacruz@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-21 08:55:00', 0, NULL, 4, NULL, 'paolo.delacruz@example.com', 'Paolo', 'D.', 'Dela Cruz', NULL, '1989-11-30', '09170000004', NULL, NULL, NULL, NULL, '2026-03-21 08:55:00', '2026-03-21 08:55:00'),
(29, 'andrea.flores@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-22 09:10:00', 0, NULL, 4, NULL, 'andrea.flores@example.com', 'Andrea', 'S.', 'Flores', NULL, '1993-07-08', '09170000005', NULL, NULL, NULL, NULL, '2026-03-22 09:10:00', '2026-03-22 09:10:00'),
(30, 'miguel.ramos@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-22 09:25:00', 0, NULL, 4, NULL, 'miguel.ramos@example.com', 'Miguel', 'A.', 'Ramos', NULL, '1988-03-17', '09170000006', NULL, NULL, NULL, NULL, '2026-03-22 09:25:00', '2026-03-22 09:25:00'),
(31, 'sofia.mendoza@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-22 09:40:00', 0, NULL, 4, NULL, 'sofia.mendoza@example.com', 'Sofia', 'C.', 'Mendoza', NULL, '1995-12-03', '09170000007', NULL, NULL, NULL, NULL, '2026-03-22 09:40:00', '2026-03-22 09:40:00'),
(32, 'daniel.garcia@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-23 09:55:00', 0, NULL, 4, NULL, 'daniel.garcia@example.com', 'Daniel', 'T.', 'Garcia', NULL, '1991-06-26', '09170000008', NULL, NULL, NULL, NULL, '2026-03-23 09:55:00', '2026-03-23 09:55:00'),
(33, 'camille.torres@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-23 10:10:00', 0, NULL, 4, NULL, 'camille.torres@example.com', 'Camille', 'R.', 'Torres', NULL, '1997-01-19', '09170000009', NULL, NULL, NULL, NULL, '2026-03-23 10:10:00', '2026-03-23 10:10:00'),
(34, 'adrian.navarro@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-23 10:25:00', 0, NULL, 4, NULL, 'adrian.navarro@example.com', 'Adrian', 'V.', 'Navarro', NULL, '1987-10-11', '09170000010', NULL, NULL, NULL, NULL, '2026-03-23 10:25:00', '2026-03-23 10:25:00'),
(35, 'dong', '$2y$10$aGPL1eUp8Qa8zt0mEnzuvOafz5bg3/BOue8yrMCpGu1NXhE0VY8bW', '2026-04-25 06:49:07', 0, NULL, 2, NULL, 'wintaxpaasa@gmail.com', 'Domingo', 'E.', 'Ancog', NULL, '2004-02-01', '09354786152', 4, NULL, '1234567890', NULL, '2026-04-24 22:49:07', '2026-04-24 22:49:07'),
(36, 'roberth', '$2y$10$gXgVnMgqOurf5iYkoF7yjOATOjBjxHWgMOw3FxpJ5XFc7oN83.1oi', '2026-04-25 06:49:50', 0, NULL, 3, NULL, 'roberth@gmail.com', 'Roberth', NULL, 'Namoc', NULL, '2004-02-22', NULL, 2, NULL, '1234567890', NULL, '2026-04-24 22:49:50', '2026-04-24 22:49:50');

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
-- Indexes for table `bundle_tasks`
--
ALTER TABLE `bundle_tasks`
  ADD PRIMARY KEY (`Bundle_Tasks_ID`),
  ADD UNIQUE KEY `uniq_bundle_task_service_step` (`Services_type_Id`,`Step_Number`),
  ADD KEY `idx_bundle_tasks_service_step` (`Services_type_Id`,`Step_Number`);

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
-- Indexes for table `certificates`
--
ALTER TABLE `certificates`
  ADD PRIMARY KEY (`certificates_ID`),
  ADD UNIQUE KEY `certificate_id` (`certificate_id`),
  ADD UNIQUE KEY `uniq_certificates_client_service` (`Client_services_ID`),
  ADD KEY `Client_ID` (`Client_ID`),
  ADD KEY `Services_type_Id` (`Services_type_Id`),
  ADD KEY `Edit_certificate_ID` (`Edit_certificate_ID`),
  ADD KEY `Client_services_ID` (`Client_services_ID`);

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
  ADD PRIMARY KEY (`Consultation_ID`),
  ADD KEY `Status_ID` (`Status_ID`),
  ADD KEY `Services_type_Id` (`Services_type_Id`),
  ADD KEY `Client_ID` (`Client_ID`),
  ADD KEY `action_by` (`action_by`);

--
-- Indexes for table `documents`
--
ALTER TABLE `documents`
  ADD PRIMARY KEY (`Documents_ID`),
  ADD KEY `appointment_id` (`appointment_id`),
  ADD KEY `Client_ID` (`Client_ID`),
  ADD KEY `Document_type_ID` (`Document_type_ID`),
  ADD KEY `Status_id` (`Status_id`);

--
-- Indexes for table `document_type`
--
ALTER TABLE `document_type`
  ADD PRIMARY KEY (`Document_type_ID`);

--
-- Indexes for table `edit_certificate`
--
ALTER TABLE `edit_certificate`
  ADD PRIMARY KEY (`Edit_certificate_ID`),
  ADD UNIQUE KEY `template_id` (`template_id`),
  ADD KEY `Services_type_Id` (`Services_type_Id`),
  ADD KEY `User_id` (`User_id`),
  ADD KEY `idx_edit_certificate_service_selected` (`Services_type_Id`,`is_selected`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`Message_ID`),
  ADD KEY `idx_messages_sender_id` (`sender_id`),
  ADD KEY `idx_messages_receiver_id` (`receiver_id`),
  ADD KEY `sender_id` (`sender_id`),
  ADD KEY `receiver_id` (`receiver_id`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`notifications_ID`),
  ADD KEY `idx_notifications_user_id` (`user_id`),
  ADD KEY `idx_notifications_sender_id` (`sender_id`);

--
-- Indexes for table `permissions`
--
ALTER TABLE `permissions`
  ADD PRIMARY KEY (`permission_id`),
  ADD UNIQUE KEY `permission_name` (`permission_name`),
  ADD UNIQUE KEY `uniq_module_action` (`module_key`,`action_key`),
  ADD KEY `User_ID` (`User_ID`);

--
-- Indexes for table `role`
--
ALTER TABLE `role`
  ADD PRIMARY KEY (`Role_id`),
  ADD KEY `Permission_page_status_id` (`Permission_page_status_id`);

--
-- Indexes for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`role_permissions_ID`),
  ADD UNIQUE KEY `uniq_role_permission` (`Role_id`,`permission_id`),
  ADD KEY `permission_id` (`permission_id`);

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
  MODIFY `audit_logs_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=113;

--
-- AUTO_INCREMENT for table `bundle_tasks`
--
ALTER TABLE `bundle_tasks`
  MODIFY `Bundle_Tasks_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `business`
--
ALTER TABLE `business`
  MODIFY `Business_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT for table `business_type`
--
ALTER TABLE `business_type`
  MODIFY `Business_type_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `certificates`
--
ALTER TABLE `certificates`
  MODIFY `certificates_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `civil_status_type`
--
ALTER TABLE `civil_status_type`
  MODIFY `civil_status_type_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `client`
--
ALTER TABLE `client`
  MODIFY `Client_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- AUTO_INCREMENT for table `client_services`
--
ALTER TABLE `client_services`
  MODIFY `Client_services_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `consultation`
--
ALTER TABLE `consultation`
  MODIFY `Consultation_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `documents`
--
ALTER TABLE `documents`
  MODIFY `Documents_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `document_type`
--
ALTER TABLE `document_type`
  MODIFY `Document_type_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `edit_certificate`
--
ALTER TABLE `edit_certificate`
  MODIFY `Edit_certificate_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `Message_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `notifications_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=58;

--
-- AUTO_INCREMENT for table `permissions`
--
ALTER TABLE `permissions`
  MODIFY `permission_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=113;

--
-- AUTO_INCREMENT for table `role`
--
ALTER TABLE `role`
  MODIFY `Role_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `role_permissions`
--
ALTER TABLE `role_permissions`
  MODIFY `role_permissions_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=445;

--
-- AUTO_INCREMENT for table `services_type`
--
ALTER TABLE `services_type`
  MODIFY `Services_type_Id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `Settings_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2780;

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
  MODIFY `User_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

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
-- Constraints for table `certificates`
--
ALTER TABLE `certificates`
  ADD CONSTRAINT `certificates_ibfk_1` FOREIGN KEY (`Client_ID`) REFERENCES `client` (`Client_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `certificates_ibfk_2` FOREIGN KEY (`Services_type_Id`) REFERENCES `services_type` (`Services_type_Id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `certificates_ibfk_3` FOREIGN KEY (`Client_services_ID`) REFERENCES `client_services` (`Client_services_ID`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `certificates_ibfk_4` FOREIGN KEY (`Edit_certificate_ID`) REFERENCES `edit_certificate` (`Edit_certificate_ID`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `certificates_ibfk_client_service` FOREIGN KEY (`Client_services_ID`) REFERENCES `client_services` (`Client_services_ID`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `certificates_ibfk_edit_certificate` FOREIGN KEY (`Edit_certificate_ID`) REFERENCES `edit_certificate` (`Edit_certificate_ID`) ON DELETE SET NULL ON UPDATE CASCADE;

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
  ADD CONSTRAINT `consultation_ibfk_2` FOREIGN KEY (`Services_type_Id`) REFERENCES `services_type` (`Services_type_Id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `consultation_ibfk_3` FOREIGN KEY (`Client_ID`) REFERENCES `client` (`Client_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `consultation_ibfk_4` FOREIGN KEY (`action_by`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `documents`
--
ALTER TABLE `documents`
  ADD CONSTRAINT `documents_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointment` (`Appointment_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `documents_ibfk_2` FOREIGN KEY (`Document_type_ID`) REFERENCES `document_type` (`Document_type_ID`) ON UPDATE CASCADE,
  ADD CONSTRAINT `documents_ibfk_3` FOREIGN KEY (`Client_ID`) REFERENCES `client` (`Client_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `documents_ibfk_4` FOREIGN KEY (`Status_id`) REFERENCES `status` (`Status_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `edit_certificate`
--
ALTER TABLE `edit_certificate`
  ADD CONSTRAINT `edit_certificate_ibfk_1` FOREIGN KEY (`Services_type_Id`) REFERENCES `services_type` (`Services_type_Id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `edit_certificate_ibfk_service` FOREIGN KEY (`Services_type_Id`) REFERENCES `services_type` (`Services_type_Id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `edit_certificate_ibfk_user` FOREIGN KEY (`User_id`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `messages_receiver_user_fk` FOREIGN KEY (`receiver_id`) REFERENCES `user` (`User_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `messages_sender_user_fk` FOREIGN KEY (`sender_id`) REFERENCES `user` (`User_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`User_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `permissions`
--
ALTER TABLE `permissions`
  ADD CONSTRAINT `permissions_ibfk_1` FOREIGN KEY (`User_ID`) REFERENCES `user` (`User_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `role`
--
ALTER TABLE `role`
  ADD CONSTRAINT `role_ibfk_1` FOREIGN KEY (`Permission_page_status_id`) REFERENCES `status` (`Status_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`Role_id`) REFERENCES `role` (`Role_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`permission_id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
