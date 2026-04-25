-- Optional: run on existing databases that were created before permission_id 57 existed.
-- Fresh installs already include this row in monitoring.sql.

INSERT IGNORE INTO `permissions` (`permission_id`, `module_key`, `action_key`, `permission_name`, `User_ID`) VALUES
(57, 'user-management', 'account-status', 'user-management.account-status', NULL);

INSERT IGNORE INTO `role_permissions` (`role_permissions_ID`, `Role_id`, `permission_id`, `is_allowed`) VALUES
(221, 1, 57, 1),
(222, 2, 57, 0),
(223, 3, 57, 0),
(224, 4, 57, 0);
