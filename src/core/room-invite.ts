export const ROOM_INVITE_ENTRY='https://a3.vibelink.cloud/go/';
export function roomCode(value:unknown):string|null{return typeof value==='string'&&/^[a-f0-9]{10}$/i.test(value)?value.toUpperCase():null;}
export function roomInviteUrl(value:unknown){const code=roomCode(value);if(!code)throw Error('房间号无效');return `${ROOM_INVITE_ENTRY}?room=${code}`;}
