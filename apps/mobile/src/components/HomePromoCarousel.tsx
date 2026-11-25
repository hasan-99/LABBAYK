import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageSource } from 'expo-image';

const slides: { source: ImageSource; label: string }[] = [
  { source: require('../../assets/images/labbayk-hero.jpg'), label: 'كل شي ناقصك، بطلب واحد' },
  { source: require('../../assets/images/labbayk-home-offer-market.jpg'), label: 'مقاضي البيت واصلة لعندك' },
  { source: require('../../assets/images/labbayk-home-offer-food.jpg'), label: 'جوعان؟ طلبك من مطعمك المفضل بيوصلك سخن' },
];

export function HomePromoCarousel({ style }: { style?: StyleProp<ViewStyle> }) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && nextWidth !== width) setWidth(nextWidth);
  };

  const goTo = useCallback((nextIndex: number, animated = true) => {
    const normalizedIndex = (nextIndex + slides.length) % slides.length;
    indexRef.current = normalizedIndex;
    setIndex(normalizedIndex);
    if (width > 0) scrollRef.current?.scrollTo({ x: normalizedIndex * width, y: 0, animated });
  }, [width]);

  useEffect(() => {
    if (!width) return;
    const timer = setInterval(() => goTo(indexRef.current + 1), 5000);
    return () => clearInterval(timer);
  }, [goTo, width]);

  return <View onLayout={onLayout} style={[{ aspectRatio: 900 / 510 }, style]}>
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      style={{ flex: 1, direction: 'ltr' }}
      onMomentumScrollEnd={(event) => {
        if (!width) return;
        const nextIndex = Math.max(0, Math.min(slides.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
        indexRef.current = nextIndex;
        setIndex(nextIndex);
      }}
      accessibilityLabel="صور العروض والرئيسية، اسحب للتبديل"
    >
      {slides.map((slide, slideIndex) => <View key={slide.label} style={{ width, height: '100%' }}>
        <Image source={slide.source} style={{ width: '100%', height: '100%' }} contentFit="cover" contentPosition={slideIndex === 0 ? { top: '12%' } : undefined} accessibilityLabel={slide.label} />
      </View>)}
    </ScrollView>
    <View style={{ position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, height: 32, borderRadius: 16, backgroundColor: 'rgba(7, 14, 10, 0.55)' }}>
      {slides.map((slide, slideIndex) => <Pressable
        key={slide.label}
        onPress={() => goTo(slideIndex)}
        accessibilityRole="button"
        accessibilityLabel={`عرض الصورة ${slideIndex + 1}`}
        accessibilityState={{ selected: index === slideIndex }}
        hitSlop={5}
        style={{ width: 30, height: 32, alignItems: 'center', justifyContent: 'center' }}
      ><View style={{ width: index === slideIndex ? 16 : 6, height: 6, borderRadius: 4, backgroundColor: index === slideIndex ? '#B7FF30' : '#C7D0C8' }} /></Pressable>)}
    </View>
  </View>;
}
