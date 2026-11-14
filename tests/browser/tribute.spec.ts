import { chooseTribute } from '../tribute-fixtures';
import { test, expect } from '@playwright/test';
import { createGame, createNextGame, isIdentity, isOpeningCard, canReturnTribute, id, type Game } from '../../src/core/game';

for (const choice of ['身份牌', '方块4', '原贡牌']) {
  test(`还贡必须手动确认：${choice === '原贡牌' ? '允许原贡牌' : `禁止${choice}`}`, async ({ page }) => {
    let fixture: Game | undefined;
    for (let seed = 1; seed < 100; seed++) {
      let n = seed;
      const previous = { ...createGame(), status: 'finished' as const, teams: [1, 1, 0, 0], order: [0, 1, 2, 3], scores: [2, 2, -2, -2] };
      const next = chooseTribute(createNextGame(previous, () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296)));
      if (next.hands[0].some(isIdentity) && next.hands[0].some(isOpeningCard)) { fixture = next; break; }
    }
    expect(fixture).toBeDefined();
    const card = choice === '身份牌' ? fixture!.hands[0].find(isIdentity)! : choice === '方块4' ? fixture!.hands[0].find(isOpeningCard)! : fixture!.tribute!.transfers[0].card;
    await page.addInitScript(g => sessionStorage.setItem('a3-practice', JSON.stringify(g)), fixture!);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('#play-label')).toHaveText('确认还贡');
    await expect(page.locator('#play')).toBeDisabled();
    await expect(page.locator('#pass')).toBeDisabled();
    // The accessible hand mirrors the 3D cards. Enter activates a focused card.
    await page.locator(`[data-card="${id(card)}"]`).focus();
    await page.keyboard.press('Enter');
    if(choice!=='原贡牌'){
      await expect(page.locator('#selection-info')).toContainText(choice==='身份牌'?'不能返还身份牌':'不能返还 ♦4');
      await expect(page.locator('#play')).toBeDisabled();
      expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('a3-practice')!).tribute.transfers[0].back)).toBeNull();
      await page.locator('#hint').click();
      const suggested=await page.locator('#hand .selected').getAttribute('data-card');
      expect(canReturnTribute(fixture!.hands[0].find(c=>id(c)===suggested)!)).toBe(true);
      expect(errors).toEqual([]);return;
    }
    await expect(page.locator('#selection-info')).toContainText('待确认');
    await expect(page.locator('#play')).toBeEnabled();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('a3-practice')!).status)).toBe('tribute');
    await page.locator('#play').click();
    await expect(page.locator('#play-label')).toHaveText('确认还贡');
    await expect.poll(async()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('a3-practice')!).tribute.transfers[0].back)).toEqual(card);
    await page.locator('#hint').click();await page.locator('#play').click();
    await expect(page.locator('#play-label')).toHaveText('出牌');
    const after = await page.evaluate(() => JSON.parse(sessionStorage.getItem('a3-practice')!));
    expect(after.tribute.transfers[0].back).toEqual(card);
    expect(after.hands[3]).toContainEqual(card);
    expect(after.tribute.transfers.every((t:any)=>!!t.back)).toBe(true);
    expect(errors).toEqual([]);
  });
}
