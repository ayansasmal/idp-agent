"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

interface MissingParameter {
  name: string;
  displayName: string;
  description: string;
  example: string;
  required?: boolean;
}

interface ParameterPromptProps {
  missingParameters: MissingParameter[];
  originalRequest: string;
  onSubmit: (completedRequest: string) => void;
  className?: string;
}

export default function ParameterPrompt({
  missingParameters,
  originalRequest,
  onSubmit,
  className = ""
}: ParameterPromptProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isExpanded, setIsExpanded] = useState(true);

  const handleInputChange = (paramName: string, value: string) => {
    setValues(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Construct the completed request
    let completedRequest = originalRequest;
    
    // Simple approach: append parameter values to the original request
    const providedParams = Object.entries(values)
      .filter(([_, value]) => value.trim())
      .map(([key, value]) => {
        const param = missingParameters.find(p => p.name === key);
        return `${param?.displayName || key}: ${value}`;
      });
    
    if (providedParams.length > 0) {
      completedRequest += ` (${providedParams.join(', ')})`;
    }
    
    onSubmit(completedRequest);
  };

  const handleQuickFill = (param: MissingParameter) => {
    if (param.example) {
      const examples = param.example.split(',').map(ex => ex.trim());
      handleInputChange(param.name, examples[0]);
    }
  };

  const allRequiredFilled = missingParameters
    .filter(p => p.required !== false)
    .every(p => values[p.name]?.trim());

  return (
    <div className={`border border-amber-200 bg-amber-50 rounded-lg ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
          <h3 className="font-medium text-amber-800">
            Additional Information Required
          </h3>
          <span className="text-sm text-amber-600">
            ({missingParameters.length} field{missingParameters.length !== 1 ? 's' : ''})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="w-5 h-5 text-amber-600" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-amber-600" />
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <p className="text-sm text-amber-700 mb-4">
            To complete your request "{originalRequest}", please provide the following information:
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {missingParameters.map((param, index) => (
              <div key={param.name} className="space-y-2">
                <label className="block text-sm font-medium text-amber-800">
                  {param.displayName}
                  {param.required !== false && (
                    <span className="text-red-500 ml-1">*</span>
                  )}
                </label>
                
                <div className="space-y-1">
                  <p className="text-xs text-amber-700">{param.description}</p>
                  
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={values[param.name] || ''}
                      onChange={(e) => handleInputChange(param.name, e.target.value)}
                      placeholder={`Enter ${param.displayName.toLowerCase()}...`}
                      className="flex-1 px-3 py-2 text-sm border border-amber-300 rounded-md 
                                 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500
                                 bg-white"
                    />
                    
                    {param.example && (
                      <button
                        type="button"
                        onClick={() => handleQuickFill(param)}
                        className="px-3 py-2 text-xs bg-amber-100 text-amber-700 rounded-md
                                   hover:bg-amber-200 transition-colors duration-200
                                   border border-amber-300"
                        title={`Use example: ${param.example.split(',')[0]?.trim()}`}
                      >
                        Example
                      </button>
                    )}
                  </div>
                  
                  {param.example && (
                    <p className="text-xs text-amber-600">
                      Examples: {param.example}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Submit Button */}
            <div className="pt-2 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="px-4 py-2 text-sm text-amber-700 bg-transparent 
                           hover:bg-amber-100 rounded-md transition-colors duration-200"
              >
                Minimize
              </button>
              
              <button
                type="submit"
                disabled={!allRequiredFilled}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200
                           ${allRequiredFilled 
                             ? 'bg-amber-600 text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500'
                             : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                           }`}
              >
                Continue with Request
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}