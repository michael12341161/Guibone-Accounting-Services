-- Optional: run on existing databases that were created before permission_id 56 existed.
-- Fresh installs already include this row in monitoring.sql.

INSERT IGNORE INTO `permissions` (`permission_id`, `module_key`, `action_key`, `permission_name`, `User_ID`) VALUES
(56, 'client-management', 'account-status', 'client-management.account-status', NULL);

INSERT IGNORE INTO `role_permissions` (`role_permissions_ID`, `Role_id`, `permission_id`, `is_allowed`) VALUES
(217, 1, 56, 1),
(218, 2, 56, 1),
(219, 3, 56, 0),
(220, 4, 56, 0);
