export const usersKeys = {
    accessDepartmentManagers: (departmentId: number | undefined) => (
        ['users', 'access', 'department-managers', departmentId] as const
    ),
};
