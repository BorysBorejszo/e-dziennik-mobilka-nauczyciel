import Ionicons from "@expo/vector-icons/build/Ionicons";
import Entypo from "@expo/vector-icons/Entypo";
import { useSegments } from "expo-router";
import * as React from "react";
import {
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import {
    GestureHandlerRootView,
    PanGestureHandler,
    State,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppSidebar } from "../components/app-sidebar";
import SafeView from "../components/SafeView";
import { SidebarProvider } from "../components/ui/sidebar";
import "../globals.css";
import {
    getEditorialPalette,
} from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";
import MessagesPage from "./messages";
import SettingsPage from "./settings";
import TeacherAnnouncementsPage from "./teacher_announcements";
import TeacherAttendancePage from "./teacher_attendance";
import TeacherBehaviorPage from "./teacher_behavior";
import TeacherGradesPage from "./teacher_grades";
import TeacherHomePage from "./teacher_home";
import TeacherSchedulePage from "./teacher_schedule";

export default function Layout() {
  const segments = useSegments();

  const routes = React.useMemo(() => {
    return ["teacher_home", "teacher_schedule", "teacher_grades", "teacher_attendance", "teacher_behavior", "messages", "teacher_announcements", "settings"];
  }, []);

  // determine current active segment (last segment)
  const currentSegment = segments[segments.length - 1] || "teacher_home";
  const currentIndex = Math.max(
    0,
    routes.indexOf(currentSegment) === -1 ? 0 : routes.indexOf(currentSegment)
  );

  const isAnimatingRef = React.useRef(false);

  const navigateToIndex = (i: number) => {
    const idx = (i + routes.length) % routes.length;
    if (isAnimatingRef.current) return;
    const target = -idx * screenWidth;
    isAnimatingRef.current = true;
    setActiveIndex(idx);
    Animated.timing(offset, {
      toValue: target,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      translateX.setValue(0);
      offset.setValue(target);
      isAnimatingRef.current = false;
    });
  };

  const screenWidth = Dimensions.get("window").width;
  const translateX = React.useRef(new Animated.Value(0)).current;
  const offset = React.useRef(
    new Animated.Value(-currentIndex * screenWidth)
  ).current;

  const combinedTranslate = React.useRef(Animated.add(offset, translateX)).current;

  // 8 slots for teacher tabs
  const pageTranslates = React.useRef(
    Array.from({ length: 8 }, (_, i) => Animated.add(combinedTranslate, i * screenWidth))
  ).current;

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true }
  );

  const tabLevels = React.useMemo(() =>
    Array.from({ length: 8 }, (_, i) => {
      const active = pageTranslates[i].interpolate({
        inputRange: [-screenWidth, 0, screenWidth],
        outputRange: [0, 1, 0],
        extrapolate: 'clamp',
      });
      const inactive = active.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
      return { active, inactive };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [activeIndex, setActiveIndex] = React.useState(currentIndex);

  React.useEffect(() => {
    const idx = Math.max(
      0,
      routes.indexOf(currentSegment) === -1 ? 0 : routes.indexOf(currentSegment)
    );
    setActiveIndex(idx);
    offset.setValue(-idx * screenWidth);
    translateX.setValue(0);
  }, [currentSegment, routes, screenWidth, offset, translateX]);

  const snapBack = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(() => {
      translateX.setValue(0);
    });
  };

  const handleStateChange = (event: any) => {
    const ne = event.nativeEvent;
    if (ne.state === State.FAILED || ne.state === State.CANCELLED) {
      snapBack();
      return;
    }
    if (ne.state !== State.END) return;

    const dx = ne.translationX ?? 0;
    const dy = ne.translationY ?? 0;

    if (Math.abs(dy) > Math.abs(dx)) {
      snapBack();
      return;
    }

    const threshold = Math.min(120, screenWidth * 0.25);
    if (dx < -threshold) {
      const next = (activeIndex + 1 + routes.length) % routes.length;
      const target = -next * screenWidth;
      setActiveIndex(next);
      Animated.parallel([
        Animated.timing(offset, { toValue: target, duration: 220, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        translateX.setValue(0);
        offset.setValue(target);
      });
    } else if (dx > threshold) {
      const prev = (activeIndex - 1 + routes.length) % routes.length;
      const target = -prev * screenWidth;
      setActiveIndex(prev);
      Animated.parallel([
        Animated.timing(offset, { toValue: target, duration: 220, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        translateX.setValue(0);
        offset.setValue(target);
      });
    } else {
      snapBack();
    }
  };

  const { theme } = useTheme();

  const swipeEnabled = true;

  const palette = getEditorialPalette(theme);
  const bg = palette.background;
  const activePillBg = theme === "dark" ? "#1e3a8a" : palette.primary;
  const activeTint = theme === "dark" ? "#ffffff" : palette.onPrimary;
  const inactiveTint = palette.textSoft;

  const insets = useSafeAreaInsets();

  const pages = [
    (props: any) => <TeacherHomePage {...props} onNavigate={navigateToIndex} />,
    TeacherSchedulePage,
    TeacherGradesPage,
    TeacherAttendancePage,
    TeacherBehaviorPage,
    MessagesPage,
    TeacherAnnouncementsPage,
    SettingsPage,
  ];

  return (
    <SidebarProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: bg }}>
        <SafeView edges={['top']} style={{ flex: 1, backgroundColor: bg }}>
          <AppSidebar />

          <View style={{ flex: 1 }}>
            <PanGestureHandler
              onGestureEvent={onGestureEvent}
              onHandlerStateChange={handleStateChange}
              activeOffsetX={[-15, 15]}
              failOffsetY={[-10, 10]}
              enabled={swipeEnabled}
            >
              <Animated.View style={{ flex: 1 }}>
                {pages.map((Page, idx) => (
                  <Animated.View
                    key={routes[idx]}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      transform: [{ translateX: pageTranslates[idx] }],
                    }}
                    pointerEvents={idx === activeIndex ? 'auto' : 'none'}
                  >
                    <Page />
                  </Animated.View>
                ))}
              </Animated.View>
            </PanGestureHandler>
          </View>

          {/* Custom static tab bar */}
          <View
            style={{
              paddingBottom: insets.bottom,
              backgroundColor: palette.tabBar,
            }}
          >
            <View
              style={[
                styles.tabBarShell,
                { backgroundColor: palette.tabBar },
              ]}
            >
              {routes.map((route, i) => {
                const { active: activeLevel, inactive: inactiveLevel } = tabLevels[i];
                return (
                  <TouchableOpacity
                    key={route}
                    onPress={() => navigateToIndex(i)}
                    style={styles.tabTouch}
                    activeOpacity={0.8}
                  >
                    <View style={styles.tabPill}>
                      {/* Active pill fill */}
                      <Animated.View
                        style={[
                          StyleSheet.absoluteFillObject,
                          { borderRadius: 22, backgroundColor: activePillBg, opacity: activeLevel },
                        ]}
                      />

                      {/* Icons */}
                      <View style={styles.tabIconWrap}>
                        <Animated.View style={{ opacity: inactiveLevel }}>
                          {route === "teacher_home" && <Entypo name="home" size={26} color={inactiveTint} />}
                          {route === "teacher_schedule" && <Entypo name="calendar" size={26} color={inactiveTint} />}
                          {route === "teacher_grades" && <Ionicons name="ribbon-outline" size={27} color={inactiveTint} />}
                          {route === "teacher_attendance" && <Ionicons name="stats-chart-outline" size={27} color={inactiveTint} />}
                          {route === "teacher_behavior" && <Ionicons name="star-outline" size={27} color={inactiveTint} />}
                          {route === "messages" && <Entypo name="chat" size={26} color={inactiveTint} />}
                          {route === "teacher_announcements" && <Ionicons name="megaphone-outline" size={26} color={inactiveTint} />}
                          {route === "settings" && <Entypo name="cog" size={26} color={inactiveTint} />}
                        </Animated.View>
                        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: activeLevel, alignItems: 'center', justifyContent: 'center' }]}>
                          {route === "teacher_home" && <Entypo name="home" size={26} color={activeTint} />}
                          {route === "teacher_schedule" && <Entypo name="calendar" size={26} color={activeTint} />}
                          {route === "teacher_grades" && <Ionicons name="ribbon-outline" size={27} color={activeTint} />}
                          {route === "teacher_attendance" && <Ionicons name="stats-chart-outline" size={27} color={activeTint} />}
                          {route === "teacher_behavior" && <Ionicons name="star-outline" size={27} color={activeTint} />}
                          {route === "messages" && <Entypo name="chat" size={26} color={activeTint} />}
                          {route === "teacher_announcements" && <Ionicons name="megaphone-outline" size={26} color={activeTint} />}
                          {route === "settings" && <Entypo name="cog" size={26} color={activeTint} />}
                        </Animated.View>
                      </View>

                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </SafeView>
      </GestureHandlerRootView>
    </SidebarProvider>
  );
}

const styles = StyleSheet.create({
  tabBarShell: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  tabTouch: {
    flex: 1,
  },
  tabPill: {
    minHeight: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  tabIconWrap: {
    minHeight: 24,
    justifyContent: "center",
    alignItems: "center",
  },
});
