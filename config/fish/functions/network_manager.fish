function net
    switch $argv[1]
        case "list"
            nmcli device wifi list
        case "connect"
            if test -z "$argv[2]"; or test -z "$argv[3]"
                echo "Please provide an SSID and password!"
            else
                nmcli device wifi connect $argv[2] password  $argv[3]
            end
        case '*'
            echo "Sub command not found!"
    end
end
