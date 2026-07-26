import type { TopicDefinition, TopicId } from "../types.js";
import { englishVocabTopic } from "./english-vocab.js";
import { financeBriefTopic } from "./finance-brief.js";

const registry: Record<TopicId, TopicDefinition> = {
  "english-vocab": englishVocabTopic,
  "finance-brief": financeBriefTopic,
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
