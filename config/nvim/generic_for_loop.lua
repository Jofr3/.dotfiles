-- Generic for loop example (iterating over a table with pairs)
local my_table = {a = 10, b = 20, c = 30}

for key, value in pairs(my_table) do
    print("Key: " .. key .. ", Value: " .. value)
end

print("\n")

-- Generic for loop example (iterating over a list/array with ipairs)
local my_list = {"apple", "banana", "cherry", "date"}

for index, value in ipairs(my_list) do
    print("Index: " .. index .. ", Value: " .. value)
end

print("\n")

-- Generic for loop with a custom iterator function
function countdown(n)
    local i = n
    return function()
        if i > 0 then
            i = i - 1
            return i + 1
        end
    end
end

for num in countdown(3) do
    print("Countdown: " .. num)
end

