export interface ActionType {
    action: string;
    resourceName?: string;
    resourceType?: string;
    environment?: string;
    riskLevel?: string;
    // Add other fields as needed
}

export interface UserResponse {
    // ...existing properties...
    actions?: ActionType[];
    // Add other fields as needed
}
