import { useRouter } from "expo-router";
import * as React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getCurrentDjangoUserId, getDjangoIdFromToken } from "../api/auth";
import { getInboxMessages, getSentMessages, MessageRecord } from "../api/messages";
import { findDjangoUserIdByUsername } from "../api/users";
import { Card, SectionHeader, PrimaryButton, EmptyPlaceholder } from "../components/editorial/MobileBlocks";
import ErrorState from "../components/ErrorState";
import Header from "../components/Header";
import { SkeletonCard } from "../components/ui/SkeletonItem";
import UserGate from "../components/UserGate";
import { useUser } from "../context/UserContext";
import { R, S, T, cardShadow, getEditorialPalette } from "../theme/editorial";
import { useTheme } from "../theme/ThemeContext";

type ConversationItem = {
  partnerId: number;
  partnerName: string;
  lastMessage: MessageRecord;
  unreadCount: number;
  isLastFromMe: boolean;
};

function groupByConversation(messages: MessageRecord[], myId: number): ConversationItem[] {
  const map = new Map<number, ConversationItem>();
  for (const msg of messages) {
    const isFromMe = msg.nadawca_id === myId;
    const partnerId = isFromMe ? msg.odbiorca_id : msg.nadawca_id;
    const partnerName = isFromMe
      ? (msg.odbiorca_username ?? `Użytkownik ${partnerId}`)
      : (msg.nadawca_username ?? `Użytkownik ${partnerId}`);
    const existing = map.get(partnerId);
    const isNewer = !existing || new Date(msg.data_wyslania) > new Date(existing.lastMessage.data_wyslania);
    if (!existing) {
      map.set(partnerId, { partnerId, partnerName, lastMessage: msg, unreadCount: (!isFromMe && !msg.przeczytana) ? 1 : 0, isLastFromMe: isFromMe });
    } else {
      if (isNewer) { existing.lastMessage = msg; existing.isLastFromMe = isFromMe; }
      if (!isFromMe && !msg.przeczytana) existing.unreadCount += 1;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastMessage.data_wyslania).getTime() - new Date(a.lastMessage.data_wyslania).getTime()
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Wczoraj";
  if (diffDays < 7) return `${diffDays} dni temu`;
  return date.toLocaleDateString("pl-PL");
}

export default function Messages() {
  const { user } = useUser();
  const router = useRouter();
  const { theme } = useTheme();
  const palette = getEditorialPalette(theme);
  const shadow = cardShadow(theme);

  const [conversations, setConversations] = React.useState<ConversationItem[]>([]);
  const [myId, setMyId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const fetchConversations = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      let resolvedId = Number(user.serverId ?? user.id ?? -1);

      try {
        const tokenId = await getDjangoIdFromToken();
        if (tokenId) {
          resolvedId = Number(tokenId);
        } else {
          const currentId = await getCurrentDjangoUserId();
          if (currentId) resolvedId = Number(currentId);
        }
      } catch {
        // ignore
      }

      if ((!resolvedId || resolvedId <= 0) && user.username) {
        try {
          const mapped = await findDjangoUserIdByUsername(user.username);
          if (mapped) resolvedId = Number(mapped);
        } catch {
          // ignore
        }
      }

      if (!resolvedId || resolvedId <= 0) {
        setConversations([]);
        setMyId(null);
        return;
      }

      setMyId(resolvedId);

      const [inbox, sent] = await Promise.all([
        getInboxMessages(resolvedId),
        getSentMessages(resolvedId),
      ]);

      // Combine and deduplicate by id
      const seen = new Set<number>();
      const all: MessageRecord[] = [];
      for (const msg of [...inbox, ...sent]) {
        if (!seen.has(msg.id)) {
          seen.add(msg.id);
          all.push(msg);
        }
      }

      setConversations(groupByConversation(all, resolvedId));
    } catch {
      setError("Nie udało się pobrać wiadomości. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  React.useEffect(() => {
    if (user?.username || user?.id) {
      void fetchConversations();
    }
  }, [fetchConversations, user?.id, user?.username, reloadKey]);

  const totalUnread = React.useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations]
  );

  if (!loading && error !== null) {
    return (
      <UserGate>
        <View style={[styles.root, { backgroundColor: palette.background }]}>
          <Header title="Wiadomości" subtitle="Konwersacje" />
          <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />
        </View>
      </UserGate>
    );
  }

  return (
    <UserGate>
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <Header
          title="Wiadomości"
          subtitle={totalUnread > 0 ? `${totalUnread} nieprzeczytanych` : "Konwersacje"}
        />

        <View style={styles.body}>
          <View style={styles.newBtnRow}>
            <PrimaryButton
              label="Nowa wiadomość"
              onPress={() => router.push("/wiadomosci/nowa_wiadomosc")}
              icon="create-outline"
              tone="primary"
            />
          </View>

          <SectionHeader
            eyebrow="Skrzynka"
            title="Konwersacje"
            meta={String(conversations.length)}
          />

          {loading ? (
            <View style={styles.skeletonList}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : error ? (
            <EmptyPlaceholder
              title="Błąd pobierania wiadomości"
              subtitle={error}
              icon="alert-circle-outline"
            />
          ) : conversations.length === 0 ? (
            <EmptyPlaceholder
              title="Brak konwersacji"
              subtitle="Nowe rozmowy pojawią się tutaj po synchronizacji."
              icon="chatbubbles-outline"
            />
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => String(item.partnerId)}
              scrollEnabled={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    void fetchConversations();
                  }}
                  tintColor={palette.primary}
                />
              }
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const avatarChar = item.partnerName ? item.partnerName[0].toUpperCase() : "?";
                const preview = item.lastMessage.tresc.slice(0, 80);
                const timeStr = formatTime(item.lastMessage.data_wyslania);
                const hasUnread = item.unreadCount > 0;

                return (
                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        `/wiadomosci/chat/${item.partnerId}?name=${encodeURIComponent(item.partnerName)}`
                      )
                    }
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel={`Konwersacja z ${item.partnerName}`}
                  >
                    <Card>
                      <View style={styles.convRow}>
                        <View
                          style={[
                            styles.avatarWrap,
                            {
                              backgroundColor: hasUnread ? palette.primaryFixed : palette.surfaceMid,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              T.title,
                              { color: hasUnread ? palette.infoText : palette.textMuted },
                            ]}
                          >
                            {avatarChar}
                          </Text>
                        </View>

                        <View style={styles.convBody}>
                          <Text style={[T.bodyMedium, { color: palette.text }]} numberOfLines={1}>
                            {item.partnerName}
                          </Text>
                          <Text
                            style={[T.label, { color: palette.textSoft, marginTop: 2 }]}
                            numberOfLines={2}
                          >
                            {item.isLastFromMe ? "Ty: " : ""}{preview}
                          </Text>
                        </View>

                        <View style={styles.convMeta}>
                          <Text style={[T.meta, { color: palette.textSoft }]}>{timeStr}</Text>
                          {hasUnread ? (
                            <View
                              style={[
                                styles.unreadBadge,
                                { backgroundColor: palette.primary },
                              ]}
                            >
                              <Text style={[T.meta, { color: palette.onPrimary, fontWeight: "700" }]}>
                                {item.unreadCount}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Card>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </UserGate>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: S[4],
    paddingTop: S[2],
    paddingBottom: 120,
  },
  newBtnRow: {
    marginBottom: S[4],
  },
  skeletonList: {
    gap: S[3],
  },
  separator: {
    height: S[3],
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S[4],
    paddingVertical: S[4],
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: R.lg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: S[3],
    flexShrink: 0,
  },
  convBody: {
    flex: 1,
    paddingRight: S[3],
  },
  convMeta: {
    alignItems: "flex-end",
    gap: S[1],
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: R.full,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: S[1],
  },
});
