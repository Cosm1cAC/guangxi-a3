import {expect,test} from 'vitest';
import {roomCode,roomInviteUrl} from '../src/core/room-invite';
test('room invitations use the fixed entry and contain only a validated room code',()=>{
  expect(roomCode('a1b2c3d4e5')).toBe('A1B2C3D4E5');expect(roomInviteUrl('a1b2c3d4e5')).toBe('https://a3.vibelink.cloud/go/?room=A1B2C3D4E5');
  for(const value of [null,42,'','short','A1B2C3D4E5&token=secret','../rooms/123','<script>xx']){expect(roomCode(value)).toBeNull();expect(()=>roomInviteUrl(value)).toThrow('房间号无效');}
});
