/**
 * Simple module response type for Phase 2 modules
 */
export interface SimpleModuleResponse {
  success: boolean;
  message: string;
  timestamp: string;
  data: any;
  metadata: {
    module: string;
    action: string;
    [key: string]: any;
  };
}

/**
 * Convert simple response to full ModuleResponse format
 */
export function convertToModuleResponse(
  requestId: string,
  simpleResponse: SimpleModuleResponse
): any {
  return {
    requestId,
    success: simpleResponse.success,
    result: simpleResponse.data,
    metadata: simpleResponse.metadata,
    nextActions: [],
    errors: simpleResponse.success ? [] : [simpleResponse.message],
    warnings: []
  };
}