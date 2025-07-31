-- Numeric for loop example
for i = 1, 5, 1 do
    print("Count: " .. i)
end

-- You can also omit the step if it's 1
for i = 1, 5 do
    print("Count (default step 1): " .. i)
end

-- Counting downwards
for i = 5, 1, -1 do
    print("Count (downwards): " .. i)
end

