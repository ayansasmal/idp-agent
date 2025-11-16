#!/bin/bash

echo "🔧 Setting up AI-IDP Environment"
echo "================================"

# Check if .env already exists
if [ -f ".env" ]; then
    echo "✅ .env file already exists"
else
    echo "📋 Creating .env from example..."
    cp .env.example .env
    echo "✅ .env file created"
fi

echo ""
echo "🔑 API Key Setup:"
echo "=================="

# Check if API key is set
if grep -q "your_anthropic_key_here" .env; then
    echo "❌ You need to set your Anthropic API key in .env"
    echo ""
    echo "1. Open the .env file in your editor"
    echo "2. Replace 'your_anthropic_key_here' with your actual API key"
    echo "3. Save the file"
    echo ""
    echo "Your API key should look like: sk-ant-api03-..."
    echo ""
    read -p "Do you want to set it now? (y/n): " response
    
    if [[ $response == "y" || $response == "Y" ]]; then
        read -p "Enter your Anthropic API key: " api_key
        if [[ -n "$api_key" ]]; then
            # Use different delimiter to avoid issues with special characters
            sed -i.bak "s|your_anthropic_key_here|$api_key|" .env
            rm .env.bak
            echo "✅ API key set successfully!"
        else
            echo "❌ No API key provided"
        fi
    fi
else
    echo "✅ Anthropic API key appears to be set"
fi

echo ""
echo "🧪 Testing configuration..."
cd packages/core
npm run test:quick

echo ""
echo "🎉 Setup complete! You can now run:"
echo "   cd packages/core"
echo "   npm run test:quick"