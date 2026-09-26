import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type ViewStyle } from 'react-native';

import { F, T } from '@/constants/theme';
import type { MediaType } from '@/lib/extract';

type Variant = 'display' | 'title' | 'body' | 'sub' | 'mono' | 'label';

export function Txt({ v = 'body', style, ...rest }: TextProps & { v?: Variant }) {
  return <Text {...rest} style={[s[v], style]} />;
}

export function Btn({
  label,
  kind = 'accent',
  style,
  disabled,
  color,
  ...rest
}: PressableProps & { label: string; kind?: 'accent' | 'raised' | 'ghost'; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      {...rest}
      style={({ pressed }) => [
        s.btn,
        kind === 'accent' && { backgroundColor: T.accent },
        kind === 'raised' && { backgroundColor: T.raised },
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      <Text style={[s.btnText, { color: color ?? (kind === 'accent' ? T.accentInk : kind === 'ghost' ? T.softInk : T.ink) }]}>{label}</Text>
    </Pressable>
  );
}

export function BackButton({ color = T.ink, onPress = () => router.back() }: { color?: string; onPress?: () => void }) {
  const ios = Platform.OS === 'ios';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: ios ? 34 : 22, lineHeight: ios ? 38 : 26, fontFamily: F.regular }}>{ios ? '‹' : '←'}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** A card row; every row after the first gets a hairline on top. */
export function Row({ first, onPress, children, style }: { first?: boolean; onPress?: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, !first && s.rowLine, pressed && { backgroundColor: T.raised }, style]}>
      {children}
    </Pressable>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[s.track, { backgroundColor: on ? T.accent : T.off }]}>
      <View style={[s.knob, { left: on ? 23 : 3, backgroundColor: on ? T.accentInk : T.knobOff }]} />
    </View>
  );
}

export function SettingRow({ title, sub, on, onPress, first, indent }: { title: string; sub?: string; on: boolean; onPress: () => void; first?: boolean; indent?: boolean }) {
  return (
    <Row first={first} onPress={onPress} style={indent && { paddingLeft: 28 }}>
      <View style={{ flex: 1 }} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={title}>
        <Txt style={{ fontSize: 15 }}>{title}</Txt>
        {sub ? <Txt v="sub" style={{ marginTop: 2 }}>{sub}</Txt> : null}
      </View>
      <Toggle on={on} />
    </Row>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Txt v="label" style={{ paddingTop: 14, paddingBottom: 2, paddingHorizontal: 2 }}>{children}</Txt>;
}

export function Radio({ on, title, sub, onPress }: { on: boolean; title: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[s.radio, { borderColor: on ? T.accent : T.line, backgroundColor: on ? T.soft : 'transparent' }]}>
      <View style={[s.radioRing, { borderColor: on ? T.accent : T.sub }]}>
        {on ? <View style={s.radioDot} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Txt style={{ fontSize: 15, fontFamily: F.semibold }}>{title}</Txt>
        {sub ? <Txt v="sub" style={{ marginTop: 2 }}>{sub}</Txt> : null}
      </View>
    </Pressable>
  );
}

export function Tag({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.tag, style]}>
      <Text style={s.tagText}>{children}</Text>
    </View>
  );
}

/** Square media thumbnail with a format tag; NSFW items render blurred with a label. */
export function Thumb({
  uri,
  type,
  fmt,
  hidden,
  radius = T.rs,
  style,
  onPress,
}: {
  uri?: string;
  type: MediaType;
  fmt?: string;
  hidden?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[s.thumb, { borderRadius: radius }, style]}>
      {uri ? (
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={hidden ? 40 : 0} autoplay={!hidden && type === 'GIF'} recyclingKey={uri} />
      ) : (
        <View style={s.thumbEmpty}><Txt v="mono" style={{ fontSize: 10, color: T.sub }}>{type === 'VID' ? '▶' : type}</Txt></View>
      )}
      {hidden ? (
        <View style={s.nsfw}>
          <Text style={[s.tagText, { fontSize: 11, fontFamily: F.semibold }]}>NSFW</Text>
          {onPress ? <Text style={{ color: '#fff', fontSize: 10.5, opacity: 0.85, fontFamily: F.regular }}>Tap to reveal</Text> : null}
        </View>
      ) : null}
      {fmt ? <Tag style={{ position: 'absolute', left: 5, bottom: 5 }}>{fmt}</Tag> : null}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  display: { fontFamily: F.semibold, fontSize: 30, letterSpacing: -0.9, color: T.ink },
  title: { fontFamily: F.semibold, fontSize: 17, color: T.ink },
  body: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: T.ink },
  sub: { fontFamily: F.regular, fontSize: 12.5, lineHeight: 17, color: T.sub },
  mono: { fontFamily: F.mono, fontSize: 12, color: T.sub },
  label: { fontFamily: F.monoMedium, fontSize: 11, letterSpacing: 0.66, textTransform: 'uppercase', color: T.sub },
  btn: { height: 46, paddingHorizontal: 18, borderRadius: T.rs, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.semibold, fontSize: 15 },
  card: { borderRadius: T.r, backgroundColor: T.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: T.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 44 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.line },
  track: { width: 48, height: 28, borderRadius: 14 },
  knob: { position: 'absolute', top: 3, width: 22, height: 22, borderRadius: 11 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: T.r, borderWidth: 1.5 },
  radioRing: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.accent },
  tag: { paddingVertical: 3, paddingHorizontal: 4, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.55)' },
  tagText: { fontFamily: F.monoMedium, fontSize: 9.5, color: '#fff' },
  thumb: { aspectRatio: 1, overflow: 'hidden', backgroundColor: T.raised },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nsfw: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.25)' },
});
