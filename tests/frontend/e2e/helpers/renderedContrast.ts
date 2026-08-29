import type { Locator } from '@playwright/test';

export async function renderedContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
    };
    const over = (front: Rgba, back: Rgba): Rgba => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
        (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
        (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
        alpha,
      ];
    };
    let background = parse(getComputedStyle(element).backgroundColor);
    let ancestor = element.parentElement;
    while (ancestor && background[3] < 1) {
      background = over(background, parse(getComputedStyle(ancestor).backgroundColor));
      ancestor = ancestor.parentElement;
    }
    if (background[3] < 1) background = over(background, [255, 255, 255, 1]);
    const foreground = over(parse(getComputedStyle(element).color), background);
    const luminance = (color: Rgba) => {
      const linear = color.slice(0, 3).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  });
}
