/** Mock 进程内的上传记录；重启后清空，避免让前端误认为已持久化。 */
export const uploadIds = new Set<string>();
