import { useId } from "react";
import { useColorScheme } from "react-native";
import Svg, { ClipPath, Defs, FeGaussianBlur, Filter, G, Mask, Path, Rect } from "react-native-svg";

const ARCH = "M17 40V21C33 7 67 7 83 21v19";
const SHIELD = "M13 44h74v14c0 18-15 30-37 40C28 88 13 76 13 58z";
const CHECK = "M35 33l15 16L86 8";
const BRICKS: [number, number, number, number][] = [
  [13, 44, 23, 11], [39, 44, 22, 11], [64, 44, 23, 11],
  [13, 58, 11, 11], [27, 58, 21.5, 11], [51.5, 58, 21.5, 11], [76, 58, 11, 11],
  [13, 72, 23, 11], [39, 72, 22, 11], [64, 72, 23, 11],
  [13, 86, 36, 14], [51.5, 86, 36, 14],
];

/**
 * The Trustbrick shield, drawn as on the website (components/brand/Logo.tsx): a navy arch, brick
 * courses and a green check. It keeps its colours in dark mode; a soft light behind the arch keeps
 * the navy readable there, as the website does on dark surfaces.
 */
export function LogoMark({ size = 64, dark }: { size?: number; dark?: boolean }) {
  const scheme = useColorScheme();
  const halo = dark ?? scheme === "dark";
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityRole="image" accessibilityLabel="Trustbrick">
      <Defs>
        <ClipPath id={`shield${id}`}>
          <Path d={SHIELD} />
        </ClipPath>
        <Mask id={`knock${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <Rect width="100" height="100" fill="#fff" />
          <Path d={CHECK} fill="none" stroke="#000" strokeWidth={19} />
        </Mask>
        <Filter id={`halo${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation={3} />
        </Filter>
      </Defs>
      <G mask={`url(#knock${id})`}>
        {halo && <Path d={ARCH} fill="none" stroke="#ffffff" strokeWidth={11} strokeLinecap="round" opacity={0.8} filter={`url(#halo${id})`} />}
        <Path d={ARCH} fill="none" stroke="#0b1c48" strokeWidth={7.5} />
        <G clipPath={`url(#shield${id})`} fill="#e2582a">
          {BRICKS.map(([x, y, w, h]) => (
            <Rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} />
          ))}
        </G>
      </G>
      <Path d={CHECK} fill="none" stroke="#2f9a56" strokeWidth={9} />
    </Svg>
  );
}
