from pathlib import Path

path = Path('tests/v8-match-lab.spec.ts')
spec = path.read_text()
old = """    await page.mouse.move(cardBox!.x + cardBox!.width / 2, cardBox!.y + cardBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(zoneBox!.x + zoneBox!.width / 2, zoneBox!.y + zoneBox!.height * 0.74, { steps: 8 });
    await expect(page.getByTestId('v8-drag-ghost')).toBeVisible();
    await expect(midfieldZone).toHaveClass(/is-drag-over/);
    await page.mouse.up();
"""
new = """    const startX = cardBox!.x + cardBox!.width / 2;
    const startY = cardBox!.y + cardBox!.height / 2;
    const endX = zoneBox!.x + zoneBox!.width / 2;
    const endY = zoneBox!.y + zoneBox!.height * 0.74;
    const pointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true };

    await bremner.dispatchEvent('pointerdown', { ...pointer, clientX: startX, clientY: startY, buttons: 1 });
    await page.locator('body').dispatchEvent('pointermove', { ...pointer, clientX: endX, clientY: endY, buttons: 1 });
    await expect(page.getByTestId('v8-drag-ghost')).toBeVisible();
    await expect(midfieldZone).toHaveClass(/is-drag-over/);
    await page.locator('body').dispatchEvent('pointerup', { ...pointer, clientX: endX, clientY: endY, buttons: 0 });
"""
assert old in spec
path.write_text(spec.replace(old, new, 1))
