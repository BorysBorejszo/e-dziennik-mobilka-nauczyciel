import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getInboxMessages, getSentMessages, MessageRecord, createMessage } from "../../api/messages";
import { useUser } from "../../context/UserContext";
import { useConversationSocket } from "../../hooks/useConversationSocket";
import { R, S, T, getEditorialPalette } from "../../theme/editorial";
import { useTheme } from "../../theme/ThemeContext";

export default function ChatScreen() {
  const { partnerId, name } = useLocalSearchParams<{ partnerId: string; name?: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { theme } = useTheme();
  const palette = getEditorialPalette(theme);

  const myId = user?.id ?? null;
  const partnerIdNum = partnerId ? Number(partnerId) : null;
  const partnerName = name ? decodeURIComponent(name) : `Użytkownik ${partnerId}`;

  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList<MessageRecord>>(null);

  const { lastMessage, sendMessage, connected } = useConversationSocket(myId, partnerIdNum);

  // Load initial messages
  const loadMessages = useCallback(async () => {
    if (!myId || !partnerIdNum) return;
    const [inbox, sent] = await Promise.all([
      getInboxMessages(myId),
      getSentMessages(myId),
    ]);
    const seen = new Set<number>();
    const all: MessageRecord[] = [];
    for (const msg of [...inbox, ...sent]) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id);
        all.push(msg);
      }
    }
    const filtered = all
      .filter(
        (msg) =>
          msg.nadawca_id === partnerIdNum ||
          msg.odbiorca_id === partnerIdNum
      )
      .sort(
        (a, b) =>
          new Date(a.data_wyslania).getTime() - new Date(b.data_wyslania).getTime()
      );
    setMessages(filtered);
  }, [myId, partnerIdNum]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // Append incoming WS messages
  useEffect(() => {
    if (!lastMessage || !myId || !partnerIdNum) return;
    // Only append if it looks like it came from partner (not ourselves via echo)
    if (lastMessage.sender_id === myId) return;
    const syntheticRecord: MessageRecord = {
      id: Date.now(),
      nadawca_id: lastMessage.sender_id,
      nadawca_username: partnerName,
      odbiorca_id: myId,
      odbiorca_username: user?.name,
      temat: "Chat",
      tresc: lastMessage.message,
      data_wyslania: lastMessage.timestamp ?? new Date().toISOString(),
      przeczytana: false,
    };
    setMessages((prev) => [...prev, syntheticRecord]);
  }, [lastMessage, myId, partnerIdNum, partnerName, user?.name]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !myId || !partnerIdNum || sending) return;
    setInputText("");
    setSending(true);

    // Optimistically append
    const optimistic: MessageRecord = {
      id: Date.now(),
      nadawca_id: myId,
      nadawca_username: user?.name,
      odbiorca_id: partnerIdNum,
      odbiorca_username: partnerName,
      temat: "Chat",
      tresc: text,
      data_wyslania: new Date().toISOString(),
      przeczytana: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    // Send via WebSocket
    sendMessage(text);

    // Also persist via REST API
    await createMessage({
      nadawca_id: myId,
      odbiorca_id: partnerIdNum,
      temat: "Chat",
      tresc: text,
    });

    setSending(false);
  };

  const formatBubbleTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const renderBubble = ({ item }: { item: MessageRecord }) => {
    const isMe = item.nadawca_id === myId;
    return (
      <View
        style={[
          styles.bubbleContainer,
          isMe ? styles.bubbleRight : styles.bubbleLeft,
        ]}
      >
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isMe ? palette.primary : palette.surface,
              borderBottomRightRadius: isMe ? R.xs : R.lg,
              borderBottomLeftRadius: isMe ? R.lg : R.xs,
            },
          ]}
        >
          <Text style={[T.body, { color: isMe ? palette.onPrimary : palette.text }]}>
            {item.tresc}
          </Text>
        </View>
        <Text
          style={[
            T.meta,
            styles.bubbleTime,
            { color: palette.textSoft },
            isMe ? styles.bubbleTimeRight : styles.bubbleTimeLeft,
          ]}
        >
          {formatBubbleTime(item.data_wyslania)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: palette.surface, borderBottomColor: palette.outline }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <View style={styles.topBarTitle}>
          <Text style={[T.bodyMedium, { color: palette.text }]} numberOfLines={1}>
            {partnerName}
          </Text>
          <View style={styles.connectedRow}>
            <View
              style={[
                styles.connDot,
                { backgroundColor: connected ? "#22c55e" : palette.textMuted },
              ]}
            />
            <Text style={[T.meta, { color: palette.textSoft }]}>
              {connected ? "Połączono" : "Rozłączono"}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderBubble}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: palette.surface, borderTopColor: palette.outline }]}>
          <TextInput
            style={[
              styles.textInput,
              { backgroundColor: palette.inputSurface, color: palette.text },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Napisz wiadomość..."
            placeholderTextColor={palette.textSoft}
            multiline
            maxLength={1000}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            style={[
              styles.sendBtn,
              { opacity: !inputText.trim() || sending ? 0.4 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Wyślij"
          >
            <Ionicons name="send" size={22} color={palette.primary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S[4],
    paddingVertical: S[3],
    borderBottomWidth: 1,
  },
  backBtn: {
    marginRight: S[3],
    padding: S[1],
  },
  topBarTitle: {
    flex: 1,
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S[1],
    marginTop: 2,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  messageList: {
    paddingHorizontal: S[4],
    paddingVertical: S[3],
    gap: S[2],
  },
  bubbleContainer: {
    maxWidth: "75%",
    marginBottom: S[2],
  },
  bubbleLeft: {
    alignSelf: "flex-start",
  },
  bubbleRight: {
    alignSelf: "flex-end",
  },
  bubble: {
    borderRadius: R.lg,
    paddingHorizontal: S[3],
    paddingVertical: S[3],
  },
  bubbleTime: {
    marginTop: 2,
  },
  bubbleTimeLeft: {
    textAlign: "left",
    marginLeft: S[1],
  },
  bubbleTimeRight: {
    textAlign: "right",
    marginRight: S[1],
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: S[3],
    paddingVertical: S[2],
    borderTopWidth: 1,
    gap: S[2],
  },
  textInput: {
    flex: 1,
    borderRadius: R.lg,
    paddingHorizontal: S[3],
    paddingVertical: S[2],
    fontSize: 15,
    maxHeight: 120,
    minHeight: 40,
  },
  sendBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});
