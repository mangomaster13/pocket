import type { TopicDefinition, TopicId } from "../types.js";
import { englishVocabTopic } from "./english-vocab.js";
import { financeBriefTopic } from "./finance-brief.js";
import { fundWatchTopic } from "./fund-watch.js";

const registry: Record<TopicId, TopicDefinition> = {
  "english-vocab": englishVocabTopic,
  "finance-brief": financeBriefTopic,
  "fund-watch": fundWatchTopic,
};

/**
 * Resolves a topic definition by id.
 */
export function getTopic(topicId: TopicId): TopicDefinition {
  const topic = registry[topicId];
  if (!topic) {
    throw new Error(`Unsupported topic: ${topicId}`);
  }
  return topic;
}
