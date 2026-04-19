-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 19, 2026 at 09:37 AM
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
(3, 24, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-20 14:24:05'),
(4, 1, 'Login successful', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:30:06'),
(5, 1, 'Logged out', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:35:16'),
(6, 1, 'Failed login attempt', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:45:34'),
(7, 1, 'Login successful', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:45:57'),
(8, 1, 'Logged out', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:49:59'),
(9, 21, 'Failed login attempt', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:50:08'),
(10, 21, 'Login successful', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:50:17'),
(11, 21, 'Logged out', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:50:25'),
(12, 22, 'Failed login attempt', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:50:44'),
(13, 22, 'Failed login attempt', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:50:51'),
(14, 22, 'Login successful', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:51:00'),
(15, 22, 'Logged out', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:51:39'),
(16, 24, 'Login successful', '180.190.44.96', 'Maramag, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-25 10:51:54'),
(17, 1, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 03:42:07'),
(18, 21, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 03:58:24'),
(19, 21, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 03:58:31'),
(20, 22, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 03:58:51'),
(21, 22, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 03:59:06'),
(22, 24, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 04:00:01'),
(23, 24, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 04:00:09'),
(24, 24, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 04:00:17'),
(25, 24, 'Failed login attempt', '202.61.110.254', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 05:34:22'),
(26, 24, 'Login successful', '202.61.110.254', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 05:34:29'),
(27, 21, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 06:26:19'),
(28, 21, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 06:26:26'),
(29, 22, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 06:37:13'),
(30, 22, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 06:37:24'),
(31, 1, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 07:09:13'),
(32, 22, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 07:54:19'),
(33, 22, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 07:54:29'),
(34, 21, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 07:55:10'),
(35, 21, 'Failed login attempt', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 07:55:19'),
(36, 21, 'Login successful', '202.61.110.247', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-03-26 07:55:29'),
(37, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 00:51:22'),
(38, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 00:51:40'),
(39, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 00:51:47'),
(40, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 00:53:06'),
(41, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 00:53:50'),
(42, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 00:53:58'),
(43, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 00:58:29'),
(44, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 00:58:57'),
(45, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:00:20'),
(46, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:01:03'),
(47, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:01:24'),
(48, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:06:05'),
(49, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:14:27'),
(50, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:15:10'),
(51, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:15:47'),
(52, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:20:57'),
(53, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 01:22:40'),
(54, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 02:22:58'),
(55, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 02:23:14'),
(56, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 02:23:31'),
(57, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 02:23:57'),
(58, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 04:29:27'),
(59, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 04:32:46'),
(60, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 04:33:30'),
(61, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 04:33:38'),
(62, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 04:33:43'),
(63, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 04:39:46'),
(64, 1, 'Module permissions updated', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 04:39:53'),
(65, 22, 'Login successful', '202.61.110.246', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 07:27:42'),
(66, 1, 'System test email sent to admin@gmail.com', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 08:24:32'),
(67, 1, 'Login successful', '202.61.110.254', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 11:42:26'),
(68, 21, 'Login successful', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 11:42:42'),
(69, 24, 'Login successful', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 11:47:54'),
(70, 1, 'Login successful', '202.61.110.254', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-15 12:13:29'),
(71, 21, 'Failed login attempt', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 12:15:13'),
(72, 21, 'Failed login attempt', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 12:15:20'),
(73, 21, 'Failed login attempt', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 12:15:29'),
(74, 21, 'Login successful', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-02 12:15:36'),
(75, 1, 'Login successful', '202.61.110.253', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 146.0.0.0', 'Windows 11', '2026-04-04 14:20:07'),
(76, 1, 'Module permissions updated', '2001:fd8:c7b9:5200:ddc7:5275:cd4b:3c09', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 07:06:06'),
(77, 1, 'Module permissions updated', '2001:fd8:c7b9:5200:ddc7:5275:cd4b:3c09', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 07:16:07'),
(78, 1, 'Module permissions updated', '2001:fd8:c7b9:5200:ddc7:5275:cd4b:3c09', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 07:16:51'),
(79, 1, 'Module permissions updated', '2001:fd8:c7b9:5200:ddc7:5275:cd4b:3c09', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 07:17:16'),
(80, 1, 'Module permissions updated', '2001:fd8:c7b9:5200:ddc7:5275:cd4b:3c09', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 07:34:13'),
(81, 1, 'Module permissions updated', '2001:fd8:c7b9:5200:ddc7:5275:cd4b:3c09', 'Cagayan de Oro, Northern Mindanao, Philippines', 'Desktop', 'Chrome 147.0.0.0', 'Windows 11', '2026-04-19 07:34:35');

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
(8, 1, NULL, 'client_signup', 'New Client Registration\nMichael I. Nacaya has submitted a registration request. Please review and approve or reject the application.', 0, '2026-03-20 13:25:13'),
(9, 1, NULL, 'client_signup', 'New Client Registration\nFrancis G. Alaba has submitted a registration request. Please review and approve or reject the application.', 0, '2026-03-20 14:22:53'),
(10, 24, 1, 'task', 'Secretary admin created a task for you. Accountant Roberth Namoc will handle the service.', 0, '2026-03-25 10:49:04'),
(11, 22, 1, 'task', 'Secretary admin assigned you a task for client Francis G. Alaba.', 0, '2026-03-25 10:49:04'),
(12, 24, 1, 'task', 'Secretary admin created a task for you. Accountant Roberth Namoc will handle the service.', 0, '2026-03-26 04:48:40'),
(13, 22, 1, 'task', 'Secretary admin assigned you a task for client Francis G. Alaba.', 0, '2026-03-26 04:48:40'),
(14, 24, 1, 'task', 'Secretary admin created a task for you. Accountant Roberth Namoc will handle the service.', 0, '2026-03-26 05:26:01'),
(15, 22, 1, 'task', 'Secretary admin assigned you a task for client Francis G. Alaba.', 0, '2026-03-26 05:26:01'),
(16, 24, 1, 'task', 'Secretary admin created a task for you. Accountant Roberth Namoc will handle the service.', 0, '2026-04-01 23:56:07'),
(17, 22, 1, 'task', 'Secretary admin assigned you a task for client Francis G. Alaba.', 0, '2026-04-01 23:56:07'),
(18, 26, 1, 'task', 'Secretary admin created a task for you. Accountant Roberth Namoc will handle the service.', 0, '2026-04-02 00:22:14'),
(19, 22, 1, 'task', 'Secretary admin assigned you a task for client Jose P. Castro.', 0, '2026-04-02 00:22:14'),
(20, 1, NULL, 'task_deadline_overdue:12:2026-04-16', 'Your task is overdue.\nTask: Book Keeping\nClient: Jose P. Castro\nDeadline: April 16, 2026\nAssigned to: Roberth Namoc', 0, '2026-04-19 07:02:49'),
(21, 1, NULL, 'task_deadline_overdue:12:2026-04-16', 'Your task is overdue.\nTask: Book Keeping\nClient: Jose P. Castro\nDeadline: April 16, 2026\nAssigned to: Roberth Namoc', 0, '2026-04-19 07:02:49'),
(22, 21, NULL, 'task_deadline_overdue:12:2026-04-16', 'Your task is overdue.\nTask: Book Keeping\nClient: Jose P. Castro\nDeadline: April 16, 2026\nAssigned to: Roberth Namoc', 0, '2026-04-19 07:02:49'),
(23, 22, NULL, 'task_deadline_overdue:12:2026-04-16', 'Your task is overdue.\nTask: Book Keeping\nClient: Jose P. Castro\nDeadline: April 16, 2026\nAssigned to: Roberth Namoc', 0, '2026-04-19 07:02:49'),
(24, 22, 1, 'module_permission_granted', 'Work Update Access Granted: Admin admin granted you access to Work Update.', 0, '2026-04-19 07:06:07'),
(25, 24, 1, 'task', 'Admin admin created a task for you. Accountant Roberth Namoc will handle the service.', 0, '2026-04-19 07:10:43'),
(26, 22, 1, 'task', 'Admin admin assigned you a task for client Francis G. Alaba.', 0, '2026-04-19 07:10:43'),
(27, 22, 1, 'module_permission_granted', 'Work Update Access Granted: Admin admin granted you access to Work Update.', 0, '2026-04-19 07:16:52'),
(28, 22, 1, 'module_permission_revoked', 'Work Update Access Removed: Admin admin removed your access to Work Update.', 0, '2026-04-19 07:17:16'),
(29, 22, 1, 'module_permission_revoked', 'User Management Access Removed: Admin admin removed your access to User Management.', 0, '2026-04-19 07:34:13'),
(30, 22, 1, 'module_permission_revoked', 'Reports Access Removed: Admin admin removed your access to Reports.', 0, '2026-04-19 07:34:36');

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
(1, 'dashboard', '', 'dashboard', NULL),
(2, 'user-management', '', 'user-management', 1),
(3, 'user-management', 'view', 'user-management.view', 1),
(4, 'user-management', 'edit', 'user-management.edit', 1),
(5, 'user-management', 'add-user', 'user-management.add-user', 1),
(6, 'permissions', '', 'permissions', NULL),
(7, 'settings', '', 'settings', NULL),
(8, 'client-management', '', 'client-management', NULL),
(9, 'client-management', 'view', 'client-management.view', NULL),
(10, 'client-management', 'edit', 'client-management.edit', NULL),
(11, 'client-management', 'add-new-client', 'client-management.add-new-client', NULL),
(12, 'client-management', 'location', 'client-management.location', NULL),
(13, 'client-management', 'file-upload', 'client-management.file-upload', NULL),
(14, 'new-client-management', '', 'new-client-management', NULL),
(15, 'documents', '', 'documents', NULL),
(16, 'documents', 'upload', 'documents.upload', NULL),
(17, 'documents', 'view-only', 'documents.view-only', NULL),
(18, 'certificate', '', 'certificate', NULL),
(19, 'certificate', 'edit', 'certificate.edit', NULL),
(20, 'certificate', 'remove', 'certificate.remove', NULL),
(21, 'certificate', 'remove-auto-send', 'certificate.remove-auto-send', NULL),
(22, 'edit-certificate', '', 'edit-certificate', NULL),
(23, 'edit-certificate', 'header-tools-properties', 'edit-certificate.header-tools-properties', NULL),
(24, 'business-status', '', 'business-status', NULL),
(25, 'appointments', '', 'appointments', NULL),
(26, 'appointments', 'approve', 'appointments.approve', NULL),
(27, 'appointments', 'decline', 'appointments.decline', NULL),
(28, 'appointments', 'view-files', 'appointments.view-files', NULL),
(29, 'scheduling', '', 'scheduling', NULL),
(30, 'scheduling', 'approve', 'scheduling.approve', NULL),
(31, 'scheduling', 'decline', 'scheduling.decline', NULL),
(32, 'scheduling', 'reschedule', 'scheduling.reschedule', NULL),
(33, 'scheduling', 'configure-times', 'scheduling.configure-times', NULL),
(34, 'tasks', '', 'tasks', NULL),
(35, 'tasks', 'create-task', 'tasks.create-task', NULL),
(36, 'tasks', 'client-appointments', 'tasks.client-appointments', NULL),
(37, 'tasks', 'task-limit', 'tasks.task-limit', NULL),
(38, 'tasks', 'edit-step', 'tasks.edit-step', NULL),
(39, 'tasks', 'remove-step', 'tasks.remove-step', NULL),
(40, 'calendar', '', 'calendar', NULL),
(41, 'work-update', '', 'work-update', NULL),
(42, 'work-update', 'check-steps', 'work-update.check-steps', NULL),
(43, 'work-update', 'history', 'work-update.history', NULL),
(44, 'work-update', 'edit', 'work-update.edit', 1),
(45, 'work-update', 'mark-done', 'work-update.mark-done', 1),
(46, 'work-update', 'decline', 'work-update.decline', NULL),
(47, 'work-update', 'archive', 'work-update.archive', NULL),
(48, 'work-update', 'restore', 'work-update.restore', NULL),
(49, 'my-tasks', '', 'my-tasks', NULL),
(50, 'messaging', '', 'messaging', NULL),
(51, 'reports', '', 'reports', 1),
(52, 'client-account', '', 'client-account', NULL),
(54, 'work-update', 'approve', 'work-update.approve', NULL),
(55, 'work-update', 'remarks', 'work-update.remarks', 1),
(56, 'client-management', 'account-status', 'client-management.account-status', NULL),
(57, 'user-management', 'account-status', 'user-management.account-status', NULL);

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
(1, 1, 1, 1),
(2, 2, 1, 1),
(3, 3, 1, 1),
(4, 4, 1, 1),
(5, 1, 2, 1),
(6, 2, 2, 0),
(7, 3, 2, 0),
(8, 4, 2, 0),
(9, 1, 3, 1),
(10, 2, 3, 0),
(11, 3, 3, 0),
(12, 4, 3, 0),
(13, 1, 4, 1),
(14, 2, 4, 0),
(15, 3, 4, 0),
(16, 4, 4, 0),
(17, 1, 5, 1),
(18, 2, 5, 0),
(19, 3, 5, 0),
(20, 4, 5, 0),
(21, 1, 6, 1),
(22, 2, 6, 0),
(23, 3, 6, 0),
(24, 4, 6, 0),
(25, 1, 7, 1),
(26, 2, 7, 0),
(27, 3, 7, 0),
(28, 4, 7, 0),
(29, 1, 8, 1),
(30, 2, 8, 1),
(31, 3, 8, 0),
(32, 4, 8, 0),
(33, 1, 9, 1),
(34, 2, 9, 1),
(35, 3, 9, 0),
(36, 4, 9, 0),
(37, 1, 10, 1),
(38, 2, 10, 1),
(39, 3, 10, 0),
(40, 4, 10, 0),
(41, 1, 11, 1),
(42, 2, 11, 1),
(43, 3, 11, 0),
(44, 4, 11, 0),
(45, 1, 12, 1),
(46, 2, 12, 1),
(47, 3, 12, 0),
(48, 4, 12, 0),
(49, 1, 13, 1),
(50, 2, 13, 1),
(51, 3, 13, 0),
(52, 4, 13, 0),
(53, 1, 14, 1),
(54, 2, 14, 0),
(55, 3, 14, 0),
(56, 4, 14, 0),
(57, 1, 15, 1),
(58, 2, 15, 1),
(59, 3, 15, 0),
(60, 4, 15, 0),
(61, 1, 16, 1),
(62, 2, 16, 1),
(63, 3, 16, 0),
(64, 4, 16, 0),
(65, 1, 17, 1),
(66, 2, 17, 1),
(67, 3, 17, 0),
(68, 4, 17, 0),
(69, 1, 18, 1),
(70, 2, 18, 0),
(71, 3, 18, 0),
(72, 4, 18, 0),
(73, 1, 19, 1),
(74, 2, 19, 0),
(75, 3, 19, 0),
(76, 4, 19, 0),
(77, 1, 20, 1),
(78, 2, 20, 0),
(79, 3, 20, 0),
(80, 4, 20, 0),
(81, 1, 21, 1),
(82, 2, 21, 0),
(83, 3, 21, 0),
(84, 4, 21, 0),
(85, 1, 22, 1),
(86, 2, 22, 0),
(87, 3, 22, 0),
(88, 4, 22, 0),
(89, 1, 23, 1),
(90, 2, 23, 0),
(91, 3, 23, 0),
(92, 4, 23, 0),
(93, 1, 24, 1),
(94, 2, 24, 1),
(95, 3, 24, 0),
(96, 4, 24, 0),
(97, 1, 25, 1),
(98, 2, 25, 1),
(99, 3, 25, 0),
(100, 4, 25, 0),
(101, 1, 26, 1),
(102, 2, 26, 1),
(103, 3, 26, 0),
(104, 4, 26, 0),
(105, 1, 27, 1),
(106, 2, 27, 1),
(107, 3, 27, 0),
(108, 4, 27, 0),
(109, 1, 28, 1),
(110, 2, 28, 1),
(111, 3, 28, 0),
(112, 4, 28, 0),
(113, 1, 29, 1),
(114, 2, 29, 0),
(115, 3, 29, 0),
(116, 4, 29, 0),
(117, 1, 30, 1),
(118, 2, 30, 0),
(119, 3, 30, 0),
(120, 4, 30, 0),
(121, 1, 31, 1),
(122, 2, 31, 0),
(123, 3, 31, 0),
(124, 4, 31, 0),
(125, 1, 32, 1),
(126, 2, 32, 0),
(127, 3, 32, 0),
(128, 4, 32, 0),
(129, 1, 33, 1),
(130, 2, 33, 0),
(131, 3, 33, 0),
(132, 4, 33, 0),
(133, 1, 34, 1),
(134, 2, 34, 1),
(135, 3, 34, 0),
(136, 4, 34, 0),
(137, 1, 35, 1),
(138, 2, 35, 1),
(139, 3, 35, 0),
(140, 4, 35, 0),
(141, 1, 36, 1),
(142, 2, 36, 1),
(143, 3, 36, 0),
(144, 4, 36, 0),
(145, 1, 37, 1),
(146, 2, 37, 0),
(147, 3, 37, 0),
(148, 4, 37, 0),
(149, 1, 38, 1),
(150, 2, 38, 1),
(151, 3, 38, 0),
(152, 4, 38, 0),
(153, 1, 39, 1),
(154, 2, 39, 1),
(155, 3, 39, 0),
(156, 4, 39, 0),
(157, 1, 40, 1),
(158, 2, 40, 1),
(159, 3, 40, 1),
(160, 4, 40, 1),
(161, 1, 41, 1),
(162, 2, 41, 1),
(163, 3, 41, 1),
(164, 4, 41, 0),
(165, 1, 42, 1),
(166, 2, 42, 1),
(167, 3, 42, 1),
(168, 4, 42, 0),
(169, 1, 43, 1),
(170, 2, 43, 1),
(171, 3, 43, 1),
(172, 4, 43, 0),
(173, 1, 44, 1),
(174, 2, 44, 1),
(175, 3, 44, 0),
(176, 4, 44, 0),
(177, 1, 45, 1),
(178, 2, 45, 1),
(179, 3, 45, 0),
(180, 4, 45, 0),
(181, 1, 46, 1),
(182, 2, 46, 1),
(183, 3, 46, 1),
(184, 4, 46, 0),
(185, 1, 47, 1),
(186, 2, 47, 1),
(187, 3, 47, 0),
(188, 4, 47, 0),
(189, 1, 48, 1),
(190, 2, 48, 1),
(191, 3, 48, 0),
(192, 4, 48, 0),
(193, 1, 49, 1),
(194, 2, 49, 0),
(195, 3, 49, 1),
(196, 4, 49, 0),
(197, 1, 50, 1),
(198, 2, 50, 1),
(199, 3, 50, 1),
(200, 4, 50, 1),
(201, 1, 51, 1),
(202, 2, 51, 0),
(203, 3, 51, 0),
(204, 4, 51, 0),
(205, 1, 52, 1),
(206, 2, 52, 1),
(207, 3, 52, 0),
(208, 4, 52, 0),
(209, 1, 54, 1),
(210, 2, 54, 1),
(211, 3, 54, 0),
(212, 4, 54, 0),
(213, 1, 55, 1),
(214, 2, 55, 1),
(215, 3, 55, 1),
(216, 4, 55, 0),
(217, 1, 56, 1),
(218, 2, 56, 1),
(219, 3, 56, 0),
(220, 4, 56, 0),
(221, 1, 57, 1),
(222, 2, 57, 0),
(223, 3, 57, 0),
(224, 4, 57, 0);

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
(6, 'login_verification_enabled', '1'),
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
(1131, 'task_reminder_interval_minutes', '0');

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
(19, 'BUSINESS', 'Unregistered'),
(20, 'TASK', 'Incomplete'),
(21, 'TASK', 'Overdue'),
(22, 'DOCUMENTS', 'Renewed'),
(23, 'DOCUMENTS', 'Expired');

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
(1, 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', '2026-02-14 01:18:12', 0, NULL, 1, 3, 'admin@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-02-14 01:18:12', '2026-03-25 10:45:57'),
(21, 'dong', 'd8c9cf11fad21a9b4ad008bec3d28f23af9eac11ad6fc772a72e9da2b0fbb311', '2026-03-20 21:23:17', 0, NULL, 2, 3, 'dong@gmail.com', 'Domingo', 'E.', 'Ancog', NULL, '2026-03-20', '4234324', 4, '313213', '21212', NULL, '2026-03-20 13:23:17', '2026-04-02 12:15:36'),
(22, 'roberth', '288691455f75bbd92deae0ab9c4453906b8d13eef7e66764ac9accbabed4f2bf', '2026-03-20 21:23:52', 0, NULL, 3, 3, 'roberth@gmail.com', 'Roberth', NULL, 'Namoc', NULL, '2026-03-20', '4234324', 3, '313213', '21212', NULL, '2026-03-20 13:23:52', '2026-03-26 07:54:29'),
(23, 'nacaya.michael123@gmail.com', 'd8c9cf11fad21a9b4ad008bec3d28f23af9eac11ad6fc772a72e9da2b0fbb311', '2026-03-20 21:25:13', 0, NULL, 4, NULL, 'nacaya.michael123@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 13:25:13', '2026-03-20 13:25:13'),
(24, 'michaelnacaya86@gmail.com', '288691455f75bbd92deae0ab9c4453906b8d13eef7e66764ac9accbabed4f2bf', '2026-03-20 22:22:53', 0, NULL, 4, NULL, 'michaelnacaya86@gmail.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 14:22:53', '2026-03-26 05:34:29'),
(25, 'elaine.santos@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-21 08:10:00', 0, NULL, 4, NULL, 'elaine.santos@example.com', 'Elaine', 'M.', 'Santos', NULL, '1994-05-12', '09170000001', NULL, NULL, NULL, NULL, '2026-03-21 08:10:00', '2026-03-21 08:10:00'),
(26, 'jose.castro@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-21 08:25:00', 0, NULL, 4, NULL, 'jose.castro@example.com', 'Jose', 'P.', 'Castro', NULL, '1990-09-21', '09170000002', NULL, NULL, NULL, NULL, '2026-03-21 08:25:00', '2026-03-21 08:25:00'),
(27, 'maria.reyes@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-21 08:40:00', 0, NULL, 4, NULL, 'maria.reyes@example.com', 'Maria', 'L.', 'Reyes', NULL, '1996-02-14', '09170000003', NULL, NULL, NULL, NULL, '2026-03-21 08:40:00', '2026-03-21 08:40:00'),
(28, 'paolo.delacruz@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-21 08:55:00', 0, NULL, 4, NULL, 'paolo.delacruz@example.com', 'Paolo', 'D.', 'Dela Cruz', NULL, '1989-11-30', '09170000004', NULL, NULL, NULL, NULL, '2026-03-21 08:55:00', '2026-03-21 08:55:00'),
(29, 'andrea.flores@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-22 09:10:00', 0, NULL, 4, NULL, 'andrea.flores@example.com', 'Andrea', 'S.', 'Flores', NULL, '1993-07-08', '09170000005', NULL, NULL, NULL, NULL, '2026-03-22 09:10:00', '2026-03-22 09:10:00'),
(30, 'miguel.ramos@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-22 09:25:00', 0, NULL, 4, NULL, 'miguel.ramos@example.com', 'Miguel', 'A.', 'Ramos', NULL, '1988-03-17', '09170000006', NULL, NULL, NULL, NULL, '2026-03-22 09:25:00', '2026-03-22 09:25:00'),
(31, 'sofia.mendoza@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-22 09:40:00', 0, NULL, 4, NULL, 'sofia.mendoza@example.com', 'Sofia', 'C.', 'Mendoza', NULL, '1995-12-03', '09170000007', NULL, NULL, NULL, NULL, '2026-03-22 09:40:00', '2026-03-22 09:40:00'),
(32, 'daniel.garcia@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-23 09:55:00', 0, NULL, 4, NULL, 'daniel.garcia@example.com', 'Daniel', 'T.', 'Garcia', NULL, '1991-06-26', '09170000008', NULL, NULL, NULL, NULL, '2026-03-23 09:55:00', '2026-03-23 09:55:00'),
(33, 'camille.torres@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-23 10:10:00', 0, NULL, 4, NULL, 'camille.torres@example.com', 'Camille', 'R.', 'Torres', NULL, '1997-01-19', '09170000009', NULL, NULL, NULL, NULL, '2026-03-23 10:10:00', '2026-03-23 10:10:00'),
(34, 'adrian.navarro@example.com', 'ba6b9cf408a3bc5568cc18317077a3d5fc81849c1b84128180240ab9680d0dd7', '2026-03-23 10:25:00', 0, NULL, 4, NULL, 'adrian.navarro@example.com', 'Adrian', 'V.', 'Navarro', NULL, '1987-10-11', '09170000010', NULL, NULL, NULL, NULL, '2026-03-23 10:25:00', '2026-03-23 10:25:00');

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
  ADD PRIMARY KEY (`Role_id`);

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
  MODIFY `audit_logs_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=82;

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
  MODIFY `notifications_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=31;

--
-- AUTO_INCREMENT for table `permissions`
--
ALTER TABLE `permissions`
  MODIFY `permission_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=58;

--
-- AUTO_INCREMENT for table `role`
--
ALTER TABLE `role`
  MODIFY `Role_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `role_permissions`
--
ALTER TABLE `role_permissions`
  MODIFY `role_permissions_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=225;

--
-- AUTO_INCREMENT for table `services_type`
--
ALTER TABLE `services_type`
  MODIFY `Services_type_Id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `Settings_ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1675;

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
  MODIFY `User_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;

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
