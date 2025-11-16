export interface ConversationMetadata {
    agentsInvolved: string[];
    totalExecutionTime: number;
    contextStored: boolean;
    approvalId?: string;
    confidence?: number;
    // Add other fields as needed
}
